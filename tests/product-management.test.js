const request = require('supertest')

const app = require('../src/app')
const sequelize = require('../src/config/database')
const {
    Category,
    Product,
    ProductImage,
    ProductVariant,
    User
} = require('../src/models')
const { hashPassword } = require('../src/utils/hash')

const testRun = Date.now()
const ownerAEmail = `management-a-${testRun}@example.com`
const ownerBEmail = `management-b-${testRun}@example.com`

let ownerA
let ownerB
let category
let productSequence = 0

async function authenticatedAgent(email = ownerAEmail) {
    const agent = request.agent(app)
    const response = await agent.post('/api/auth/login').send({
        email,
        password: '123456'
    })

    expect(response.status).toBe(200)
    return agent
}

async function createManagedProduct(owner, overrides = {}) {
    productSequence += 1
    const product = await Product.create({
        owner_id: owner.id,
        title: overrides.title || `Managed product ${productSequence}`,
        description: overrides.description || 'A valid management test product description.',
        category: category.slug,
        category_id: category.id,
        brand: 'Management Test',
        price: overrides.price || 500000,
        stock: 0,
        weight_grams: 500,
        sizes: null,
        colors: null,
        status: overrides.status || 'active'
    })

    await ProductImage.create({
        product_id: product.id,
        image_url: `/uploads/products/fixture-${testRun}-${productSequence}.png`,
        sort_order: 0
    })
    await ProductVariant.create({
        product_id: product.id,
        sku: overrides.sku || `MANAGED-${testRun}-${productSequence}`,
        variant_key: 'default',
        price: null,
        image_url: null,
        stock_quantity: overrides.stock ?? 5,
        status: 'active',
        is_default: true
    })

    return product
}

async function getManagedDetail(agent, productId) {
    const response = await agent.get(`/api/products/mine/${productId}`)

    expect(response.status).toBe(200)
    return response.body.data
}

describe('Complete owner product management security and lifecycle', function () {
    beforeAll(async function () {
        category = await Category.findOne({
            where: { slug: 'giay-chay-bo' }
        })
        ownerA = await User.create({
            full_name: 'Management Owner A',
            email: ownerAEmail,
            phone: null,
            address: null,
            password: await hashPassword('123456'),
            role: 'user',
            status: 'active'
        })
        ownerB = await User.create({
            full_name: 'Management Owner B',
            email: ownerBEmail,
            phone: null,
            address: null,
            password: await hashPassword('123456'),
            role: 'user',
            status: 'active'
        })
    })

    afterAll(async function () {
        await User.destroy({
            where: {
                id: [ownerA.id, ownerB.id]
            }
        })
        await sequelize.close()
    })

    it('1. rejects unauthenticated access to managed product detail', async function () {
        const product = await createManagedProduct(ownerA)
        const response = await request(app).get(`/api/products/mine/${product.id}`)

        expect(response.status).toBe(401)
    })

    it('2. lists only products owned by the session user', async function () {
        const ownProduct = await createManagedProduct(ownerA)
        const otherProduct = await createManagedProduct(ownerB)
        const agent = await authenticatedAgent()
        const response = await agent.get('/api/products/mine?limit=50')
        const ids = response.body.data.items.map((item) => Number(item.id))

        expect(response.status).toBe(200)
        expect(ids).toContain(Number(ownProduct.id))
        expect(ids).not.toContain(Number(otherProduct.id))
    })

    it('3. prevents user A from viewing user B managed product detail', async function () {
        const otherProduct = await createManagedProduct(ownerB)
        const agent = await authenticatedAgent()
        const response = await agent.get(`/api/products/mine/${otherProduct.id}`)

        expect(response.status).toBe(404)
    })

    it('4. prevents user A from updating user B product', async function () {
        const otherProduct = await createManagedProduct(ownerB)
        const agent = await authenticatedAgent()
        const response = await agent.patch(`/api/products/mine/${otherProduct.id}`).send({
            title: 'Unauthorized update',
            updated_at: otherProduct.updatedAt.toISOString(),
            lock_version: otherProduct.lock_version
        })

        expect(response.status).toBe(404)
        await otherProduct.reload()
        expect(otherProduct.title).not.toBe('Unauthorized update')
    })

    it('5. prevents user A from deleting user B product', async function () {
        const otherProduct = await createManagedProduct(ownerB)
        const agent = await authenticatedAgent()
        const response = await agent.delete(`/api/products/mine/${otherProduct.id}`)

        expect(response.status).toBe(404)
        expect(await Product.findByPk(otherProduct.id)).not.toBeNull()
    })

    it('6. bulk delete skips products owned by another user', async function () {
        const ownProduct = await createManagedProduct(ownerA)
        const otherProduct = await createManagedProduct(ownerB)
        const agent = await authenticatedAgent()
        const response = await agent.post('/api/products/mine/bulk-delete').send({
            ids: [ownProduct.id, otherProduct.id]
        })

        expect(response.status).toBe(200)
        expect(response.body.data.deleted_count).toBe(1)
        expect(response.body.data.skipped_count).toBe(1)
        expect(await Product.findByPk(ownProduct.id)).toBeNull()
        expect(await Product.findByPk(otherProduct.id)).not.toBeNull()
    })

    it('7. removes a soft-deleted product from the main owner list', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()

        expect((await agent.delete(`/api/products/mine/${product.id}`)).status).toBe(200)
        const response = await agent.get('/api/products/mine?limit=50')

        expect(response.body.data.items.map((item) => Number(item.id)))
            .not.toContain(Number(product.id))
    })

    it('8. removes a soft-deleted active product from marketplace', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()

        await agent.delete(`/api/products/mine/${product.id}`)
        const listResponse = await request(app).get('/api/products')
        const detailResponse = await request(app).get(`/api/products/${product.id}`)

        expect(listResponse.body.data.map((item) => Number(item.id)))
            .not.toContain(Number(product.id))
        expect(detailResponse.status).toBe(404)
    })

    it('9. exposes a soft-deleted product only in the correct owner trash', async function () {
        const product = await createManagedProduct(ownerA)
        const ownerAgent = await authenticatedAgent()
        const otherAgent = await authenticatedAgent(ownerBEmail)

        await ownerAgent.delete(`/api/products/mine/${product.id}`)
        const ownerTrash = await ownerAgent.get('/api/products/mine/trash?limit=50')
        const otherTrash = await otherAgent.get('/api/products/mine/trash?limit=50')

        expect(ownerTrash.body.data.items.map((item) => Number(item.id)))
            .toContain(Number(product.id))
        expect(otherTrash.body.data.items.map((item) => Number(item.id)))
            .not.toContain(Number(product.id))
    })

    it('10. restores the product with its previous status', async function () {
        const product = await createManagedProduct(ownerA, { status: 'unactive' })
        const agent = await authenticatedAgent()

        await agent.delete(`/api/products/mine/${product.id}`)
        const response = await agent.patch(`/api/products/mine/${product.id}/restore`)

        expect(response.status).toBe(200)
        expect(response.body.data.status).toBe('unactive')
        expect(await Product.findByPk(product.id)).not.toBeNull()
    })

    it('restores an active product as draft when its category is unavailable', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()

        await agent.delete(`/api/products/mine/${product.id}`)
        await category.update({ status: 'inactive' })

        try {
            const response = await agent.patch(
                `/api/products/mine/${product.id}/restore`
            )

            expect(response.status).toBe(200)
            expect(response.body.data.status).toBe('draft')
            expect(response.body.warning).toMatch(/category is unavailable/i)
            expect(
                (await request(app).get(`/api/products/${product.id}`)).status
            ).toBe(404)
        } finally {
            await category.update({ status: 'active' })
        }
    })

    it('11. prevents user A from restoring user B product', async function () {
        const product = await createManagedProduct(ownerB)
        const otherAgent = await authenticatedAgent(ownerBEmail)
        const ownerAgent = await authenticatedAgent()

        await otherAgent.delete(`/api/products/mine/${product.id}`)
        const response = await ownerAgent.patch(`/api/products/mine/${product.id}/restore`)

        expect(response.status).toBe(404)
        expect(await Product.findByPk(product.id)).toBeNull()
    })

    it('12. updates valid scalar fields and returns a new timestamp', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()
        const detail = await getManagedDetail(agent, product.id)
        const response = await agent.patch(`/api/products/mine/${product.id}`).send({
            title: 'Updated management product',
            price: 725000,
            updated_at: detail.updated_at,
            lock_version: detail.lock_version
        })

        expect(response.status).toBe(200)
        expect(response.body.data.title).toBe('Updated management product')
        expect(response.body.data.price).toBe(725000)
        expect(response.body.data.lock_version).toBe(detail.lock_version + 1)
    })

    it('13. rejects invalid editable fields', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()
        const detail = await getManagedDetail(agent, product.id)
        const response = await agent.patch(`/api/products/mine/${product.id}`).send({
            title: '',
            price: -1,
            updated_at: detail.updated_at,
            lock_version: detail.lock_version
        })

        expect(response.status).toBe(400)
    })

    it('14. rejects attempts to change owner through update payload', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()
        const detail = await getManagedDetail(agent, product.id)
        const response = await agent.patch(`/api/products/mine/${product.id}`).send({
            title: 'Still owned by A',
            owner_id: ownerB.id,
            updated_at: detail.updated_at,
            lock_version: detail.lock_version
        })

        expect(response.status).toBe(400)
        await product.reload()
        expect(Number(product.owner_id)).toBe(Number(ownerA.id))
    })

    it('15. rejects mass assignment of system fields', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()
        const detail = await getManagedDetail(agent, product.id)
        const response = await agent.patch(`/api/products/mine/${product.id}`).send({
            title: 'No system mutation',
            status: 'deleted',
            deleted_at: new Date().toISOString(),
            updated_at: detail.updated_at,
            lock_version: detail.lock_version
        })

        expect(response.status).toBe(400)
        await product.reload()
        expect(product.status).toBe('active')
    })

    it('16. rejects a nonexistent category', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()
        const detail = await getManagedDetail(agent, product.id)
        const response = await agent.patch(`/api/products/mine/${product.id}`).send({
            category_id: 999999999,
            updated_at: detail.updated_at,
            lock_version: detail.lock_version
        })

        expect(response.status).toBe(400)
    })

    it('17. prevents direct update of a deleted product', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()
        const detail = await getManagedDetail(agent, product.id)

        await agent.delete(`/api/products/mine/${product.id}`)
        const response = await agent.patch(`/api/products/mine/${product.id}`).send({
            title: 'Must not update',
            updated_at: detail.updated_at,
            lock_version: detail.lock_version
        })

        expect(response.status).toBe(404)
    })

    it('18. rejects empty and invalid bulk id arrays', async function () {
        const agent = await authenticatedAgent()
        const empty = await agent.post('/api/products/mine/bulk-delete').send({ ids: [] })
        const invalid = await agent.post('/api/products/mine/bulk-delete').send({
            ids: [0, 'not-an-id']
        })

        expect(empty.status).toBe(400)
        expect(invalid.status).toBe(400)
    })

    it('19. de-duplicates repeated ids during bulk delete', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()
        const response = await agent.post('/api/products/mine/bulk-delete').send({
            ids: [product.id, product.id, product.id]
        })

        expect(response.status).toBe(200)
        expect(response.body.data.submitted_count).toBe(3)
        expect(response.body.data.requested_count).toBe(1)
        expect(response.body.data.deleted_count).toBe(1)
    })

    it('20. permanently deletes only a trashed product and cascades its data', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()
        const activeAttempt = await agent.delete(`/api/products/mine/${product.id}/permanent`)

        expect(activeAttempt.status).toBe(404)
        await agent.delete(`/api/products/mine/${product.id}`)
        const response = await agent.delete(`/api/products/mine/${product.id}/permanent`)

        expect(response.status).toBe(200)
        expect(await Product.findByPk(product.id, { paranoid: false })).toBeNull()
        expect(await ProductImage.count({ where: { product_id: product.id } })).toBe(0)
        expect(await ProductVariant.count({ where: { product_id: product.id } })).toBe(0)
    })

    it('21. keeps count and pagination correct after deletion', async function () {
        const prefix = `Pagination ${testRun}`
        const products = []

        for (let index = 0; index < 3; index += 1) {
            products.push(await createManagedProduct(ownerA, {
                title: `${prefix} ${index}`
            }))
        }

        const agent = await authenticatedAgent()
        const before = await agent.get(`/api/products/mine?search=${testRun}&limit=2&page=1`)

        await agent.delete(`/api/products/mine/${products[0].id}`)
        const after = await agent.get(`/api/products/mine?search=${testRun}&limit=2&page=1`)

        expect(before.body.data.pagination.totalItems).toBeGreaterThan(
            after.body.data.pagination.totalItems
        )
        expect(before.body.data.pagination.totalItems - after.body.data.pagination.totalItems)
            .toBe(1)
    })

    it('22. returns no duplicate products between stable pages', async function () {
        const prefix = `Stable page ${testRun}`

        for (let index = 0; index < 4; index += 1) {
            await createManagedProduct(ownerA, {
                title: `${prefix} ${index}`
            })
        }

        const agent = await authenticatedAgent()
        const first = await agent.get(`/api/products/mine?search=${encodeURIComponent(prefix)}&limit=2&page=1`)
        const second = await agent.get(`/api/products/mine?search=${encodeURIComponent(prefix)}&limit=2&page=2`)
        const firstIds = first.body.data.items.map((item) => Number(item.id))
        const secondIds = second.body.data.items.map((item) => Number(item.id))

        expect(first.status).toBe(200)
        expect(second.status).toBe(200)
        expect(firstIds.filter((id) => secondIds.includes(id))).toEqual([])
    })

    it('23. rolls back scalar and association updates when variant creation fails', async function () {
        const product = await createManagedProduct(ownerA)
        const reservedSkuProduct = await createManagedProduct(ownerA)
        const reservedVariant = await ProductVariant.findOne({
            where: { product_id: reservedSkuProduct.id }
        })
        const agent = await authenticatedAgent()
        const detail = await getManagedDetail(agent, product.id)
        const originalVariantCount = await ProductVariant.count({
            where: { product_id: product.id }
        })
        const response = await agent.patch(`/api/products/mine/${product.id}`).send({
            title: 'This update must roll back',
            options: [],
            variants: [{
                sku: reservedVariant.sku,
                option_values: {},
                price: null,
                stock_quantity: 10,
                image_index: 0,
                status: 'active'
            }],
            updated_at: detail.updated_at,
            lock_version: detail.lock_version
        })

        expect(response.status).toBe(409)
        await product.reload()
        expect(product.title).not.toBe('This update must roll back')
        expect(await ProductVariant.count({ where: { product_id: product.id } }))
            .toBe(originalVariantCount)
    })

    it('24. preserves session authentication across owner management requests', async function () {
        const agent = await authenticatedAgent()
        const profile = await agent.get('/api/users/me')
        const products = await agent.get('/api/products/mine')

        expect(profile.status).toBe(200)
        expect(Number(profile.body.data.id)).toBe(Number(ownerA.id))
        expect(products.status).toBe(200)
    })

    it('updates variants and existing image order in the same transaction', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()
        const detail = await getManagedDetail(agent, product.id)
        const response = await agent.patch(`/api/products/mine/${product.id}`).send({
            title: 'Atomic association update',
            options: [],
            variants: [{
                sku: `ATOMIC-${testRun}-${product.id}`,
                option_values: {},
                price: 650000,
                stock_quantity: 17,
                image_index: 0,
                status: 'active'
            }],
            image_order: [`existing:${detail.images[0].id}`],
            updated_at: detail.updated_at,
            lock_version: detail.lock_version
        })

        expect(response.status).toBe(200)
        expect(response.body.data.title).toBe('Atomic association update')
        expect(response.body.data.images).toHaveLength(1)
        expect(response.body.data.variants).toHaveLength(1)
        expect(response.body.data.variants[0].stock_quantity).toBe(17)
        expect(response.body.data.variants[0].image_url)
            .toBe(response.body.data.images[0].image_url)
    })

    it('rejects stale optimistic lock versions with conflict status', async function () {
        const product = await createManagedProduct(ownerA)
        const agent = await authenticatedAgent()
        const detail = await getManagedDetail(agent, product.id)
        const firstUpdate = await agent.patch(`/api/products/mine/${product.id}`).send({
            title: 'First concurrent update',
            lock_version: detail.lock_version
        })
        const staleUpdate = await agent.patch(`/api/products/mine/${product.id}`).send({
            title: 'Stale concurrent update',
            lock_version: detail.lock_version
        })

        expect(firstUpdate.status).toBe(200)
        expect(staleUpdate.status).toBe(409)
        await product.reload()
        expect(product.title).toBe('First concurrent update')
    })

    describe('Bulk product status', function () {
        const endpoint = '/api/products/mine/bulk-status'

        it('requires an authenticated session', async function () {
            const response = await request(app).patch(endpoint).send({
                ids: [1],
                status: 'unactive'
            })

            expect(response.status).toBe(401)
        })

        it('rejects empty, malformed and oversized product id arrays', async function () {
            const agent = await authenticatedAgent()
            const empty = await agent.patch(endpoint).send({
                ids: [],
                status: 'unactive'
            })
            const malformed = await agent.patch(endpoint).send({
                ids: ['not-an-id'],
                status: 'unactive'
            })
            const oversized = await agent.patch(endpoint).send({
                ids: Array.from({ length: 51 }, (_, index) => index + 1),
                status: 'inactive'
            })

            expect(empty.status).toBe(400)
            expect(malformed.status).toBe(400)
            expect(oversized.status).toBe(400)
        })

        it('rejects unsupported statuses and fields outside the dedicated payload', async function () {
            const product = await createManagedProduct(ownerA)
            const agent = await authenticatedAgent()
            const unsupported = await agent.patch(endpoint).send({
                ids: [product.id],
                status: 'out_of_stock'
            })
            const systemManaged = await agent.patch(endpoint).send({
                ids: [product.id],
                status: 'needs_variant_setup'
            })
            const extraField = await agent.patch(endpoint).send({
                ids: [product.id],
                status: 'unactive',
                price: 1
            })

            expect(unsupported.status).toBe(400)
            expect(systemManaged.status).toBe(400)
            expect(extraField.status).toBe(400)
            await product.reload()
            expect(product.status).toBe('active')
        })

        it('deduplicates ids and returns accurate matched and updated counts', async function () {
            const product = await createManagedProduct(ownerA)
            const agent = await authenticatedAgent()
            const response = await agent.patch(endpoint).send({
                ids: [product.id, product.id],
                status: 'unactive'
            })

            expect(response.status).toBe(200)
            expect(response.body.data).toEqual({
                matchedCount: 1,
                updatedCount: 1,
                status: 'unactive'
            })
            await product.reload()
            expect(product.status).toBe('unactive')
        })

        it('updates every selected owner product in one successful batch', async function () {
            const first = await createManagedProduct(ownerA)
            const second = await createManagedProduct(ownerA)
            const agent = await authenticatedAgent()
            const response = await agent.patch(endpoint).send({
                ids: [first.id, second.id],
                status: 'unactive'
            })

            expect(response.status).toBe(200)
            expect(response.body.data.matchedCount).toBe(2)
            expect(response.body.data.updatedCount).toBe(2)
            await Promise.all([first.reload(), second.reload()])
            expect(first.status).toBe('unactive')
            expect(second.status).toBe('unactive')
        })

        it('does not exaggerate the count when a product already has the target status', async function () {
            const unchanged = await createManagedProduct(ownerA, { status: 'unactive' })
            const changed = await createManagedProduct(ownerA)
            const agent = await authenticatedAgent()
            const response = await agent.patch(endpoint).send({
                ids: [unchanged.id, changed.id],
                status: 'unactive'
            })

            expect(response.status).toBe(200)
            expect(response.body.data.matchedCount).toBe(2)
            expect(response.body.data.updatedCount).toBe(1)
        })

        it('rejects another owner product without revealing or changing it', async function () {
            const otherProduct = await createManagedProduct(ownerB)
            const agent = await authenticatedAgent()
            const response = await agent.patch(endpoint).send({
                ids: [otherProduct.id],
                status: 'unactive'
            })

            expect(response.status).toBe(404)
            expect(response.body.message).not.toContain(otherProduct.title)
            await otherProduct.reload()
            expect(otherProduct.status).toBe('active')
        })

        it('rolls back the entire mixed-owner batch', async function () {
            const ownProduct = await createManagedProduct(ownerA)
            const otherProduct = await createManagedProduct(ownerB)
            const agent = await authenticatedAgent()
            const response = await agent.patch(endpoint).send({
                ids: [ownProduct.id, otherProduct.id],
                status: 'unactive'
            })

            expect(response.status).toBe(404)
            await Promise.all([ownProduct.reload(), otherProduct.reload()])
            expect(ownProduct.status).toBe('active')
            expect(otherProduct.status).toBe('active')
        })

        it('rejects a soft-deleted product and leaves the whole batch unchanged', async function () {
            const activeProduct = await createManagedProduct(ownerA)
            const deletedProduct = await createManagedProduct(ownerA)
            const agent = await authenticatedAgent()
            await deletedProduct.destroy()

            const response = await agent.patch(endpoint).send({
                ids: [activeProduct.id, deletedProduct.id],
                status: 'unactive'
            })

            expect(response.status).toBe(404)
            await activeProduct.reload()
            const deletedRecord = await Product.findByPk(deletedProduct.id, {
                paranoid: false
            })
            expect(activeProduct.status).toBe('active')
            expect(deletedRecord.status).toBe('active')
        })

        it('preserves variant status and stock while changing only product status', async function () {
            const product = await createManagedProduct(ownerA, { stock: 17 })
            const variantBefore = await ProductVariant.findOne({
                where: { product_id: product.id }
            })
            const agent = await authenticatedAgent()
            const response = await agent.patch(endpoint).send({
                ids: [product.id],
                status: 'unactive'
            })
            const variantAfter = await ProductVariant.findByPk(variantBefore.id)

            expect(response.status).toBe(200)
            expect(variantAfter.status).toBe(variantBefore.status)
            expect(variantAfter.stock_quantity).toBe(variantBefore.stock_quantity)
        })

        it('makes marketplace visibility follow the active sale rule', async function () {
            const product = await createManagedProduct(ownerA)
            const agent = await authenticatedAgent()

            expect((await request(app).get(`/api/products/${product.id}`)).status)
                .toBe(200)
            expect((await agent.patch(endpoint).send({
                ids: [product.id],
                status: 'unactive'
            })).status).toBe(200)
            expect((await request(app).get(`/api/products/${product.id}`)).status)
                .toBe(404)
            expect((await agent.patch(endpoint).send({
                ids: [product.id],
                status: 'active'
            })).status).toBe(200)
            expect((await request(app).get(`/api/products/${product.id}`)).status)
                .toBe(200)
        })

        it('keeps the existing owner edit API working after a bulk status change', async function () {
            const product = await createManagedProduct(ownerA)
            const agent = await authenticatedAgent()
            const bulkResponse = await agent.patch(endpoint).send({
                ids: [product.id],
                status: 'unactive'
            })
            const detail = await getManagedDetail(agent, product.id)
            const editResponse = await agent
                .patch(`/api/products/mine/${product.id}`)
                .send({
                    title: 'Edited after bulk status',
                    lock_version: detail.lock_version
                })

            expect(bulkResponse.status).toBe(200)
            expect(editResponse.status).toBe(200)
            expect(editResponse.body.data.title).toBe('Edited after bulk status')
        })
    })
})
