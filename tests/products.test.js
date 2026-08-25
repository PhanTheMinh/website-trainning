const fs = require('fs/promises')
const path = require('path')
const request = require('supertest')

const app = require('../src/app')
const sequelize = require('../src/config/database')
const {
    Category,
    Product,
    ProductOption,
    ProductOptionValue,
    ProductVariant,
    ProductVariantImage,
    ProductVariantValue,
    User
} = require('../src/models')
const { hashPassword } = require('../src/utils/hash')
const { productsDirectory } = require('../src/config/uploads')

const testRun = Date.now()
const testEmail = `product-test-${testRun}@example.com`
const otherEmail = `product-other-${testRun}@example.com`
let testUser
let otherUser
let createdProduct
let defaultProduct
let outOfStockProduct
let shoeCategory
let accessoryCategory

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
)

const avif = Buffer.from([
    0x00, 0x00, 0x00, 0x0c,
    0x66, 0x72, 0x65, 0x65,
    0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x18,
    0x66, 0x74, 0x79, 0x70,
    0x6d, 0x69, 0x66, 0x31,
    0x00, 0x00, 0x00, 0x00,
    0x61, 0x76, 0x69, 0x66,
    0x6d, 0x69, 0x61, 0x66
])

const complexOptions = [
    {
        code: 'color',
        name: 'Màu sắc',
        values: ['Đen', 'Trắng']
    },
    {
        code: 'size',
        name: 'Kích thước',
        values: ['39', '40']
    }
]

function complexVariants(sku = `RUN-${testRun}-BLACK-39`) {
    return [
        {
            sku,
            option_values: {
                color: 'Đen',
                size: '39'
            },
            price: null,
            stock_quantity: 5,
            image_index: 0,
            status: 'active'
        },
        {
            sku: null,
            option_values: {
                color: 'Đen',
                size: '40'
            },
            price: 1350000,
            stock_quantity: 3,
            image_index: 1,
            status: 'active'
        },
        {
            sku: null,
            option_values: {
                color: 'Trắng',
                size: '40'
            },
            price: null,
            stock_quantity: 0,
            image_index: null,
            status: 'active'
        }
    ]
}

async function getUserProductFiles(userId) {
    try {
        const filenames = await fs.readdir(productsDirectory)

        return filenames
            .filter((filename) => filename.startsWith(`product-${userId}-`))
            .sort()
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []
        }

        throw error
    }
}

async function authenticatedAgent(email = testEmail) {
    const agent = request.agent(app)
    const loginResponse = await agent
        .post('/api/auth/login')
        .send({
            email,
            password: '123456'
        })

    expect(loginResponse.status).toBe(200)
    return agent
}

function productRequest(agent, overrides = {}) {
    const fields = {
        title: 'Giày chạy bộ kiểm thử',
        description: 'Sản phẩm dùng để kiểm tra luồng variant và tồn kho.',
        category_id: String(shoeCategory.id),
        brand: 'Run Test',
        price: '1250000',
        weight_grams: '750',
        options: JSON.stringify(complexOptions),
        variants: JSON.stringify(complexVariants()),
        ...overrides
    }
    let pendingRequest = agent.post('/api/products')

    Object.entries(fields).forEach(([key, value]) => {
        if (value !== undefined) {
            pendingRequest = pendingRequest.field(key, value)
        }
    })

    return pendingRequest
        .attach('images', png, {
            filename: 'product-primary.png',
            contentType: 'image/png'
        })
        .attach('images', png, {
            filename: 'product-secondary.png',
            contentType: 'image/png'
        })
}

describe('Product variant APIs', function () {
    beforeAll(async function () {
        shoeCategory = await Category.findOne({
            where: { slug: 'giay-chay-bo' }
        })
        accessoryCategory = await Category.findOne({
            where: { slug: 'phu-kien-chay-bo' }
        })
        testUser = await User.create({
            full_name: 'Product Test User',
            email: testEmail,
            phone: null,
            address: null,
            password: await hashPassword('123456'),
            role: 'user',
            status: 'active'
        })
        otherUser = await User.create({
            full_name: 'Other Product User',
            email: otherEmail,
            phone: null,
            address: null,
            password: await hashPassword('123456'),
            role: 'user',
            status: 'active'
        })
    })

    afterAll(async function () {
        const filenames = [
            ...await getUserProductFiles(testUser.id),
            ...await getUserProductFiles(otherUser.id)
        ]

        await Promise.all(filenames.map((filename) =>
            fs.rm(path.join(productsDirectory, filename), { force: true })
        ))

        await User.destroy({
            where: {
                id: [testUser.id, otherUser.id]
            }
        })
        await sequelize.close()
    })

    it('requires an authenticated session to create a product', async function () {
        const response = await request(app)
            .post('/api/products')
            .field('title', 'Unauthorized product')

        expect(response.status).toBe(401)
        expect(response.body.success).toBe(false)
    })

    it('creates product, options, variants and per-variant stock atomically', async function () {
        const agent = await authenticatedAgent()
        const response = await productRequest(agent)

        expect(response.status).toBe(201)
        expect(response.body.success).toBe(true)
        expect(Number(response.body.data.owner_id)).toBe(Number(testUser.id))
        expect(response.body.data.status).toBe('active')
        expect(response.body.data.brand).toBe('Run Test')
        expect(response.body.data.stock).toBe(8)
        expect(response.body.data.options).toHaveLength(2)
        expect(response.body.data.variants).toHaveLength(3)
        expect(response.body.data.min_price).toBe(1250000)
        expect(response.body.data.max_price).toBe(1350000)

        createdProduct = response.body.data
        const customPriceVariant = createdProduct.variants.find(
            (variant) => variant.price === 1350000
        )
        const generatedVariants = createdProduct.variants.filter(
            (variant) => variant.sku !== `RUN-${testRun}-BLACK-39`
        )

        expect(customPriceVariant.effective_price).toBe(1350000)
        expect(customPriceVariant.image_url).toBe(
            createdProduct.images[1].image_url
        )
        expect(generatedVariants).toHaveLength(2)
        generatedVariants.forEach((variant) => {
            expect(variant.sku).toMatch(/-P\d+-/)
        })

        expect(await ProductOption.count({
            where: { product_id: createdProduct.id }
        })).toBe(2)
        expect(await ProductOptionValue.count()).toBeGreaterThanOrEqual(4)
        expect(await ProductVariant.count({
            where: { product_id: createdProduct.id }
        })).toBe(3)
        expect(await ProductVariantValue.count()).toBeGreaterThanOrEqual(6)

        const storedProduct = await Product.findByPk(createdProduct.id)
        expect(storedProduct.stock).toBe(0)

        const detailResponse = await agent.get(
            `/api/products/${createdProduct.id}`
        )
        expect(detailResponse.status).toBe(200)
        expect(detailResponse.body.data.stock).toBe(8)
        expect(detailResponse.body.data.colors).toEqual(['Đen', 'Trắng'])
        expect(detailResponse.body.data.sizes).toEqual(['39', '40'])
    })

    it('creates one default variant for a product without options', async function () {
        const agent = await authenticatedAgent()
        const response = await productRequest(agent, {
            title: 'Bình nước không tùy chọn',
            category_id: String(accessoryCategory.id),
            options: JSON.stringify([]),
            variants: JSON.stringify([{
                sku: '',
                option_values: {},
                price: null,
                stock_quantity: 20,
                image_index: null,
                status: 'active'
            }])
        })

        expect(response.status).toBe(201)
        expect(response.body.data.options).toEqual([])
        expect(response.body.data.variants).toHaveLength(1)
        expect(response.body.data.variants[0].is_default).toBe(true)
        expect(response.body.data.variants[0].stock_quantity).toBe(20)
        expect(response.body.data.stock).toBe(20)
        defaultProduct = response.body.data
    })

    it('publishes but marks a valid zero-stock product unavailable', async function () {
        const agent = await authenticatedAgent()
        const response = await productRequest(agent, {
            title: 'Sản phẩm đã hết hàng',
            options: JSON.stringify([]),
            variants: JSON.stringify([{
                sku: '',
                option_values: {},
                price: null,
                stock_quantity: 0,
                image_index: null,
                status: 'active'
            }])
        })

        expect(response.status).toBe(201)
        expect(response.body.data.status).toBe('active')
        expect(response.body.data.stock).toBe(0)
        expect(response.body.data.available).toBe(false)
        outOfStockProduct = response.body.data
    })

    it('accepts an AVIF product image with a valid AVIF file signature', async function () {
        const agent = await authenticatedAgent()
        const response = await agent
            .post('/api/products')
            .field('title', 'Sản phẩm ảnh AVIF')
            .field(
                'description',
                'Sản phẩm dùng để kiểm tra định dạng hình ảnh AVIF.'
            )
            .field('category_id', String(shoeCategory.id))
            .field('price', '900000')
            .field('options', JSON.stringify([]))
            .field('variants', JSON.stringify([{
                sku: '',
                option_values: {},
                price: null,
                stock_quantity: 1,
                image_index: 0,
                status: 'active'
            }]))
            .attach('images', avif, {
                filename: 'product.avif',
                contentType: 'image/avif'
            })

        expect(response.status).toBe(201)
        expect(response.body.data.images[0].image_url).toMatch(/\.avif$/)
        expect(response.body.data.variants[0].image_url).toBe(
            response.body.data.images[0].image_url
        )
    })

    it('creates and updates a separate multi-image library for a variant', async function () {
        const agent = await authenticatedAgent()
        const createResponse = await agent
            .post('/api/products')
            .field('title', 'Sản phẩm chỉ dùng ảnh variant')
            .field(
                'description',
                'Sản phẩm kiểm tra thư viện ảnh riêng biệt của từng variant.'
            )
            .field('category_id', String(shoeCategory.id))
            .field('price', '990000')
            .field('options', JSON.stringify([]))
            .field('variants', JSON.stringify([{
                sku: `VARIANT-IMAGES-${testRun}`,
                option_values: {},
                price: null,
                stock_quantity: 2,
                image_index: null,
                images: ['new:0', 'new:1'],
                status: 'active'
            }]))
            .attach('variant_images', png, {
                filename: 'variant-front.png',
                contentType: 'image/png'
            })
            .attach('variant_images', avif, {
                filename: 'variant-side.avif',
                contentType: 'image/avif'
            })

        expect(createResponse.status).toBe(201)
        expect(createResponse.body.data.images).toHaveLength(0)
        expect(createResponse.body.data.gallery_images).toHaveLength(2)
        expect(createResponse.body.data.variants[0].images).toHaveLength(2)
        expect(createResponse.body.data.variants[0].image_url).toBe(
            createResponse.body.data.variants[0].images[0].image_url
        )

        const product = createResponse.body.data
        const retainedImage = product.variants[0].images[0]
        const updateResponse = await agent
            .patch(`/api/products/mine/${product.id}`)
            .field('options', JSON.stringify([]))
            .field('variants', JSON.stringify([{
                sku: product.variants[0].sku,
                option_values: {},
                price: null,
                stock_quantity: 3,
                image_index: null,
                images: [`existing:${retainedImage.id}`, 'new:0'],
                status: 'active'
            }]))
            .field('image_order', JSON.stringify([]))
            .field('lock_version', String(product.lock_version))
            .attach('variant_images', png, {
                filename: 'variant-detail.png',
                contentType: 'image/png'
            })

        expect(updateResponse.status).toBe(200)
        expect(updateResponse.body.data.images).toHaveLength(0)
        expect(updateResponse.body.data.variants[0].images).toHaveLength(2)
        expect(await ProductVariantImage.count({
            include: [{
                model: ProductVariant,
                as: 'variant',
                where: { product_id: product.id }
            }]
        })).toBe(2)
    })

    it('detects AVIF content mislabeled as a JPEG and stores the correct extension', async function () {
        const agent = await authenticatedAgent()
        const response = await agent
            .post('/api/products')
            .field('title', 'Mislabeled AVIF product image')
            .field(
                'description',
                'The file name is JPEG but the uploaded content is valid AVIF.'
            )
            .field('category_id', String(shoeCategory.id))
            .field('price', '900000')
            .field('options', JSON.stringify([]))
            .field('variants', JSON.stringify([{
                sku: '',
                option_values: {},
                price: null,
                stock_quantity: 1,
                image_index: 0,
                status: 'active'
            }]))
            .attach('images', avif, {
                filename: 'product.jpeg',
                contentType: 'image/jpeg'
            })

        expect(response.status).toBe(201)
        expect(response.body.data.images[0].image_url).toMatch(/\.avif$/)
        expect(response.body.data.variants[0].image_url).toBe(
            response.body.data.images[0].image_url
        )
    })

    it('rejects a thirteenth product image and removes partial uploads', async function () {
        const agent = await authenticatedAgent()
        const filesBeforeRequest = await getUserProductFiles(testUser.id)
        let pendingRequest = agent.post('/api/products')

        for (let index = 0; index < 13; index += 1) {
            pendingRequest = pendingRequest.attach('images', avif, {
                filename: `product-${index}.avif`,
                contentType: 'image/avif'
            })
        }

        const response = await pendingRequest

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('12 images')
        expect(await getUserProductFiles(testUser.id)).toEqual(
            filesBeforeRequest
        )
    })

    it('keeps the five megabyte limit for every product image', async function () {
        const agent = await authenticatedAgent()
        const filesBeforeRequest = await getUserProductFiles(testUser.id)
        const response = await agent
            .post('/api/products')
            .attach(
                'images',
                Buffer.alloc(5 * 1024 * 1024 + 1, 0xff),
                {
                    filename: 'oversized.avif',
                    contentType: 'image/avif'
                }
            )

        expect(response.status).toBe(413)
        expect(response.body.message).toContain('5 MB')
        expect(await getUserProductFiles(testUser.id)).toEqual(
            filesBeforeRequest
        )
    })

    it('rejects duplicate combinations and removes uploaded files', async function () {
        const agent = await authenticatedAgent()
        const filesBeforeRequest = await getUserProductFiles(testUser.id)
        const duplicates = complexVariants()
        duplicates[1].option_values = {
            ...duplicates[0].option_values
        }
        const response = await productRequest(agent, {
            title: 'Duplicate combination product',
            variants: JSON.stringify(duplicates)
        })

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('duplicate variants')
        expect(await Product.count({
            where: { title: 'Duplicate combination product' }
        })).toBe(0)
        expect(await getUserProductFiles(testUser.id)).toEqual(
            filesBeforeRequest
        )
    })

    it('enforces globally unique normalized SKUs', async function () {
        const agent = await authenticatedAgent()
        const response = await productRequest(agent, {
            title: 'Duplicate SKU product',
            variants: JSON.stringify([{
                sku: `run ${testRun} black 39`,
                option_values: {},
                price: null,
                stock_quantity: 1,
                image_index: null,
                status: 'active'
            }]),
            options: JSON.stringify([])
        })

        expect(response.status).toBe(409)
        expect(response.body.success).toBe(false)
        expect(await Product.count({
            where: { title: 'Duplicate SKU product' }
        })).toBe(0)
    })

    it('rejects legacy stock and owner fields from clients', async function () {
        const agent = await authenticatedAgent()
        const response = await productRequest(agent, {
            stock: '99',
            owner_id: String(otherUser.id)
        })

        expect(response.status).toBe(400)
        expect(response.body.message).toContain('stock')
        expect(response.body.message).toContain('owner_id')
    })

    it('lists active products and computes availability from variants', async function () {
        const response = await request(app).get('/api/products')
        const complex = response.body.data.find(
            (product) => Number(product.id) === Number(createdProduct.id)
        )
        const defaultItem = response.body.data.find(
            (product) => Number(product.id) === Number(defaultProduct.id)
        )
        const unavailableItem = response.body.data.find(
            (product) => Number(product.id) === Number(outOfStockProduct.id)
        )

        expect(response.status).toBe(200)
        expect(response.body.pagination.pageSize).toBe(12)
        expect(response.body.pagination.currentPage).toBe(1)
        expect(response.body.data.length).toBeLessThanOrEqual(12)
        expect(response.body.facets.categories).toEqual(expect.any(Array))
        expect(response.body.facets.brands).toEqual(expect.any(Array))
        expect(complex.stock).toBe(8)
        expect(complex.available).toBe(true)
        expect(defaultItem.stock).toBe(20)
        expect(unavailableItem).toBeDefined()
        expect(unavailableItem.available).toBe(false)
    })

    it('paginates storefront products and rejects unsafe page sizes', async function () {
        const firstPage = await request(app)
            .get('/api/products?page=1&limit=2')
        const oversizedPage = await request(app)
            .get('/api/products?limit=21')
        const invalidPage = await request(app)
            .get('/api/products?page=0')

        expect(firstPage.status).toBe(200)
        expect(firstPage.body.data).toHaveLength(2)
        expect(firstPage.body.pagination.pageSize).toBe(2)
        expect(firstPage.body.pagination.totalItems).toBeGreaterThanOrEqual(3)
        expect(oversizedPage.status).toBe(400)
        expect(invalidPage.status).toBe(400)
    })

    it('hides stopped variants from customers but keeps them for the owner', async function () {
        const variant = await ProductVariant.findOne({
            where: {
                product_id: createdProduct.id,
                status: 'active'
            }
        })
        await variant.update({ status: 'inactive' })

        try {
            const storefrontResponse = await request(app)
                .get(`/api/products/${createdProduct.id}`)
            const ownerAgent = await authenticatedAgent()
            const managedResponse = await ownerAgent
                .get(`/api/products/mine/${createdProduct.id}`)

            expect(storefrontResponse.status).toBe(200)
            expect(storefrontResponse.body.data.variants.some(
                (item) => Number(item.id) === Number(variant.id)
            )).toBe(false)
            expect(managedResponse.status).toBe(200)
            expect(managedResponse.body.data.variants.find(
                (item) => Number(item.id) === Number(variant.id)
            ).status).toBe('inactive')
        } finally {
            await variant.update({ status: 'active' })
        }
    })

    it('allows only the product owner to update variant stock', async function () {
        const ownerAgent = await authenticatedAgent()
        const otherAgent = await authenticatedAgent(otherEmail)
        const variant = createdProduct.variants[0]
        const deniedResponse = await otherAgent
            .patch(`/api/products/${createdProduct.id}/variants/${variant.id}/stock`)
            .send({ stock_quantity: 11 })

        expect(deniedResponse.status).toBe(404)

        const response = await ownerAgent
            .patch(`/api/products/${createdProduct.id}/variants/${variant.id}/stock`)
            .send({ stock_quantity: 11 })

        expect(response.status).toBe(200)
        expect(response.body.data.variants.find(
            (item) => Number(item.id) === Number(variant.id)
        ).stock_quantity).toBe(11)
        expect(response.body.data.stock).toBe(
            createdProduct.stock - variant.stock_quantity + 11
        )
        expect(response.body.data.lock_version).toBe(
            createdProduct.lock_version + 1
        )

        const staleEditResponse = await ownerAgent
            .patch(`/api/products/mine/${createdProduct.id}`)
            .send({
                title: 'This stale edit must not be saved',
                lock_version: createdProduct.lock_version
            })

        expect(staleEditResponse.status).toBe(409)
    })

    it('rejects invalid stock updates', async function () {
        const agent = await authenticatedAgent()
        const variant = createdProduct.variants[0]
        const negativeResponse = await agent
            .patch(`/api/products/${createdProduct.id}/variants/${variant.id}/stock`)
            .send({ stock_quantity: -1 })
        const decimalResponse = await agent
            .patch(`/api/products/${createdProduct.id}/variants/${variant.id}/stock`)
            .send({ stock_quantity: 1.5 })

        expect(negativeResponse.status).toBe(400)
        expect(decimalResponse.status).toBe(400)
    })

    it('rolls back the complete product and removes images when a variant fails', async function () {
        const agent = await authenticatedAgent()
        const filesBeforeRequest = await getUserProductFiles(testUser.id)
        const title = 'Variant transaction rollback product'
        const createSpy = jest
            .spyOn(ProductVariant, 'create')
            .mockRejectedValueOnce(new Error('Simulated variant failure'))

        try {
            const response = await productRequest(agent, { title })

            expect(response.status).toBe(500)
            expect(await Product.count({ where: { title } })).toBe(0)
            expect(await getUserProductFiles(testUser.id)).toEqual(
                filesBeforeRequest
            )
        } finally {
            createSpy.mockRestore()
        }
    })

    it('rejects invalid image content without leaving data or files', async function () {
        const agent = await authenticatedAgent()
        const filesBeforeRequest = await getUserProductFiles(testUser.id)
        const response = agent
            .post('/api/products')
            .field('title', 'Invalid image content')
            .field(
                'description',
                'This request pretends that plain content is a PNG image.'
            )
            .field('category_id', String(shoeCategory.id))
            .field('price', '600000')
            .field('options', JSON.stringify([]))
            .field('variants', JSON.stringify([{
                sku: '',
                option_values: {},
                price: null,
                stock_quantity: 4,
                image_index: null,
                status: 'active'
            }]))
            .attach('images', Buffer.from('not-a-real-png-image'), {
                filename: 'fake.png',
                contentType: 'image/png'
            })

        const result = await response
        expect(result.status).toBe(400)
        expect(result.body.message).toContain('Invalid product image content')
        expect(result.body.message).toContain('fake.png')
        expect(await getUserProductFiles(testUser.id)).toEqual(
            filesBeforeRequest
        )
    })
})
