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
const ownerEmail = `my-products-owner-${testRun}@example.com`
const otherEmail = `my-products-other-${testRun}@example.com`

let owner
let otherUser
let shoeCategory
let shirtCategory
let inactiveCategory
let ownerProducts

async function authenticatedAgent() {
    const agent = request.agent(app)
    const response = await agent
        .post('/api/auth/login')
        .send({
            email: ownerEmail,
            password: '123456'
        })

    expect(response.status).toBe(200)
    return agent
}

async function createProductWithVariant(data, index) {
    const product = await Product.create({
        owner_id: data.ownerId,
        title: data.title,
        description: `Mô tả kiểm thử cho ${data.title}`,
        category: data.category?.slug || 'legacy-unclassified',
        category_id: data.category?.id || null,
        brand: 'Test Brand',
        price: data.price,
        stock: 0,
        weight_grams: null,
        sizes: null,
        colors: null,
        status: 'active'
    })

    await ProductVariant.create({
        product_id: product.id,
        sku: `MY-PRODUCTS-${testRun}-${index}`,
        variant_key: 'default',
        price: data.variantPrice ?? null,
        image_url: null,
        stock_quantity: data.stock,
        status: 'active',
        is_default: true
    })

    return product
}

function expectPriceOrder(items, direction) {
    const prices = items.map((item) => item.min_price)
    const expected = [...prices].sort((left, right) =>
        direction === 'asc' ? left - right : right - left
    )

    expect(prices).toEqual(expected)
}

describe('Account product management APIs', function () {
    beforeAll(async function () {
        shoeCategory = await Category.findOne({
            where: { slug: 'giay-chay-bo' }
        })
        shirtCategory = await Category.findOne({
            where: { slug: 'ao-chay-bo' }
        })
        inactiveCategory = await Category.create({
            name: `Danh mục ẩn ${testRun}`,
            slug: `danh-muc-an-${testRun}`,
            description: null,
            accent: null,
            status: 'inactive'
        })
        owner = await User.create({
            full_name: 'My Products Owner',
            email: ownerEmail,
            phone: null,
            address: null,
            password: await hashPassword('123456'),
            role: 'user',
            status: 'active'
        })
        otherUser = await User.create({
            full_name: 'My Products Other User',
            email: otherEmail,
            phone: null,
            address: null,
            password: await hashPassword('123456'),
            role: 'user',
            status: 'active'
        })

        const definitions = Array.from({ length: 14 }, (_, index) => ({
            title: index === 0
                ? 'Giày Siêu Nhẹ'
                : `Sản phẩm ${String(index).padStart(2, '0')}`,
            category: index === 13
                ? null
                : index % 2 === 0 ? shoeCategory : shirtCategory,
            price: 100000 + index * 10000,
            variantPrice: index === 0 ? 50000 : null,
            stock: index + 1
        }))

        ownerProducts = []

        for (let index = 0; index < definitions.length; index += 1) {
            ownerProducts.push(await createProductWithVariant({
                ...definitions[index],
                ownerId: owner.id
            }, index))
        }

        await ProductImage.create({
            product_id: ownerProducts[0].id,
            image_url: '/uploads/products/test-primary.png',
            sort_order: 0
        })

        await createProductWithVariant({
            ownerId: otherUser.id,
            title: 'Sản phẩm của người khác',
            category: shoeCategory,
            price: 999999,
            stock: 99
        }, 99)
    })

    afterAll(async function () {
        await User.destroy({
            where: {
                id: [owner.id, otherUser.id]
            }
        })
        await inactiveCategory.destroy()
        await sequelize.close()
    })

    it('returns only active categories from the database', async function () {
        const response = await request(app).get('/api/categories')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.data.length).toBeGreaterThanOrEqual(2)
        expect(response.body.data.some(
            (category) => Number(category.id) === Number(inactiveCategory.id)
        )).toBe(false)
        expect(response.body.data.every(
            (category) => category.id && category.name && category.slug
        )).toBe(true)
    })

    it('requires a session to list account products', async function () {
        const response = await request(app).get('/api/products/mine')

        expect(response.status).toBe(401)
        expect(response.body.success).toBe(false)
    })

    it('limits results to the session owner and paginates ten per page', async function () {
        const agent = await authenticatedAgent()
        const firstPage = await agent.get('/api/products/mine')
        const secondPage = await agent.get('/api/products/mine?page=2')
        const firstIds = firstPage.body.data.items.map((item) => Number(item.id))
        const secondIds = secondPage.body.data.items.map((item) => Number(item.id))
        const ownerIds = new Set(ownerProducts.map((product) => Number(product.id)))

        expect(firstPage.status).toBe(200)
        expect(firstPage.body.data.items).toHaveLength(10)
        expect(secondPage.body.data.items).toHaveLength(4)
        expect(firstPage.body.data.pagination).toEqual({
            currentPage: 1,
            pageSize: 10,
            totalItems: 14,
            totalPages: 2,
            hasPreviousPage: false,
            hasNextPage: true
        })
        expect(secondPage.body.data.pagination.hasPreviousPage).toBe(true)
        expect(secondPage.body.data.pagination.hasNextPage).toBe(false)
        expect([...firstIds, ...secondIds].every((id) => ownerIds.has(id)))
            .toBe(true)
        expect(new Set([...firstIds, ...secondIds]).size).toBe(14)
    })

    it('sorts names A to Z by default and Z to A on request', async function () {
        const agent = await authenticatedAgent()
        const ascending = await agent.get('/api/products/mine?limit=50')
        const descending = await agent.get(
            '/api/products/mine?sort=name_desc&limit=50'
        )
        const ascendingTitles = ascending.body.data.items.map(
            (item) => item.title
        )
        const descendingTitles = descending.body.data.items.map(
            (item) => item.title
        )

        expect(ascending.status).toBe(200)
        expect(descending.status).toBe(200)
        expect(ascendingTitles).toEqual([...ascendingTitles].sort(
            (left, right) => left.localeCompare(right, 'vi', {
                sensitivity: 'base'
            })
        ))
        expect(descendingTitles).toEqual([...descendingTitles].sort(
            (left, right) => right.localeCompare(left, 'vi', {
                sensitivity: 'base'
            })
        ))
    })

    it('sorts by the minimum effective variant price in both directions', async function () {
        const agent = await authenticatedAgent()
        const ascending = await agent.get(
            '/api/products/mine?sort=price_asc&limit=50'
        )
        const descending = await agent.get(
            '/api/products/mine?sort=price_desc&limit=50'
        )

        expect(ascending.status).toBe(200)
        expect(descending.status).toBe(200)
        expectPriceOrder(ascending.body.data.items, 'asc')
        expectPriceOrder(descending.body.data.items, 'desc')
        expect(ascending.body.data.items[0].min_price).toBe(50000)
    })

    it('searches names case-insensitively with and without Vietnamese accents', async function () {
        const agent = await authenticatedAgent()
        const withoutAccent = await agent.get(
            '/api/products/mine?search=giay&limit=50'
        )
        const uppercase = await agent.get(
            '/api/products/mine?search=GIÀY&limit=50'
        )

        expect(withoutAccent.status).toBe(200)
        expect(uppercase.status).toBe(200)
        expect(withoutAccent.body.data.items.map((item) => item.title))
            .toContain('Giày Siêu Nhẹ')
        expect(uppercase.body.data.items.map((item) => item.title))
            .toContain('Giày Siêu Nhẹ')
    })

    it('combines owner, search, category filter and sort before pagination', async function () {
        const agent = await authenticatedAgent()
        const query = new URLSearchParams({
            search: 'Sản phẩm',
            categoryId: String(shoeCategory.id),
            sort: 'price_desc',
            page: '1',
            limit: '10'
        })
        const response = await agent.get(
            `/api/products/mine?${query.toString()}`
        )
        const items = response.body.data.items

        expect(response.status).toBe(200)
        expect(items.length).toBeGreaterThan(0)
        expect(items.every(
            (item) => Number(item.category.id) === Number(shoeCategory.id)
        )).toBe(true)
        expect(items.every((item) => item.title.includes('Sản phẩm'))).toBe(true)
        expectPriceOrder(items, 'desc')
        expect(response.body.data.pagination.totalItems).toBe(items.length)
    })

    it('groups by category order and places unclassified products last', async function () {
        const agent = await authenticatedAgent()
        const response = await agent.get(
            '/api/products/mine?sort=category_asc&limit=50'
        )
        const items = response.body.data.items
        const categorizedNames = items
            .filter((item) => item.category)
            .map((item) => item.category.name)

        expect(response.status).toBe(200)
        expect(categorizedNames).toEqual([...categorizedNames].sort(
            (left, right) => left.localeCompare(right, 'vi', {
                sensitivity: 'base'
            })
        ))
        expect(items.at(-1).category).toBeNull()
    })

    it('rejects invalid pagination, sort and category parameters', async function () {
        const agent = await authenticatedAgent()
        const invalidQueries = [
            'page=0',
            'page=99',
            'limit=51',
            'sort=title_drop_table',
            'categoryId=999999999',
            `categoryId=${inactiveCategory.id}`
        ]

        for (const query of invalidQueries) {
            const response = await agent.get(`/api/products/mine?${query}`)

            expect(response.status).toBe(400)
            expect(response.body.success).toBe(false)
        }
    })
})
