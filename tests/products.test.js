const fs = require('fs/promises')
const path = require('path')
const request = require('supertest')

const app = require('../src/app')
const sequelize = require('../src/config/database')
const { Product, ProductImage, User } = require('../src/models')
const { hashPassword } = require('../src/utils/hash')
const { productsDirectory } = require('../src/config/uploads')

const testEmail = `product-test-${Date.now()}@example.com`
let testUser
let createdProduct
let secondaryProduct
let inactiveProduct
const uploadedProductPaths = []

const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64'
)

async function getTestUserProductFiles() {
    try {
        const filenames = await fs.readdir(productsDirectory)

        return filenames
            .filter((filename) => filename.startsWith(`product-${testUser.id}-`))
            .sort()
    } catch (error) {
        if (error.code === 'ENOENT') {
            return []
        }

        throw error
    }
}

describe('Product APIs', function () {
    beforeAll(async function () {
        testUser = await User.create({
            full_name: 'Product Test User',
            email: testEmail,
            phone: null,
            address: null,
            password: hashPassword('123456'),
            role: 'user',
            status: 'active'
        })
    })

    afterAll(async function () {
        const testUserFiles = await getTestUserProductFiles()

        await Promise.all(
            [
                ...uploadedProductPaths,
                ...testUserFiles.map((filename) =>
                    path.join(productsDirectory, filename)
                )
            ].map((filePath) =>
                fs.rm(filePath, {
                    force: true
                })
            )
        )

        if (createdProduct) {
            await Product.destroy({
                where: {
                    id: createdProduct.id
                }
            })
        }

        if (secondaryProduct) {
            await Product.destroy({
                where: {
                    id: secondaryProduct.id
                }
            })
        }

        if (inactiveProduct) {
            await Product.destroy({
                where: {
                    id: inactiveProduct.id
                }
            })
        }

        if (testUser) {
            await User.destroy({
                where: {
                    id: testUser.id
                }
            })
        }

        await sequelize.close()
    })

    async function authenticatedAgent() {
        const agent = request.agent(app)
        const loginResponse = await agent
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: '123456'
            })

        expect(loginResponse.status).toBe(200)
        return agent
    }

    it('uses src/uploads/products as the product image directory', function () {
        expect(productsDirectory).toBe(
            path.resolve(__dirname, '..', 'src', 'uploads', 'products')
        )
    })

    it('requires an authenticated session to create a product', async function () {
        const response = await request(app)
            .post('/api/products')
            .field('title', 'Unauthorized product')

        expect(response.status).toBe(401)
        expect(response.body.success).toBe(false)
    })

    it('creates a product owned by the current user and stores image URLs', async function () {
        const agent = await authenticatedAgent()
        const response = await agent
            .post('/api/products')
            .field('title', 'Giay chay bo kiem thu')
            .field(
                'description',
                'San pham dung de kiem tra luong tao moi.'
            )
            .field('category', 'giay-chay-bo')
            .field('price', '1250000')
            .field('stock', '8')
            .field('weight_grams', '750')
            .field('sizes', JSON.stringify(['39', '40', '41']))
            .field('colors', JSON.stringify(['Den', 'Trang']))
            .attach('images', png, {
                filename: 'product-primary.png',
                contentType: 'image/png'
            })
            .attach('images', png, {
                filename: 'product-secondary.png',
                contentType: 'image/png'
            })

        expect(response.status).toBe(201)
        expect(response.body.success).toBe(true)
        expect(Number(response.body.data.owner_id)).toBe(Number(testUser.id))
        expect(Number(response.body.data.owner.id)).toBe(Number(testUser.id))
        expect(response.body.data.price).toBe(1250000)
        expect(response.body.data.category).toBe('giay-chay-bo')
        expect(response.body.data.sizes).toEqual(['39', '40', '41'])
        expect(response.body.data.colors).toEqual(['Den', 'Trang'])
        expect(response.body.data.images).toHaveLength(2)
        expect(response.body.data.images.map((image) => image.sort_order))
            .toEqual([0, 1])

        response.body.data.images.forEach((image) => {
            expect(image.image_url).toMatch(
                /^\/uploads\/products\/product-\d+-\d+-[a-f0-9]{12}\.png$/
            )
        })

        createdProduct = response.body.data
        const imageUrl = createdProduct.images[0].image_url

        createdProduct.images.forEach((image) => {
            uploadedProductPaths.push(
                path.join(productsDirectory, path.basename(image.image_url))
            )
        })

        await Promise.all(
            uploadedProductPaths.map((filePath) =>
                expect(fs.stat(filePath)).resolves.toMatchObject({
                    size: png.length
                })
            )
        )

        const storedImages = await ProductImage.findAll({
            where: {
                product_id: createdProduct.id
            },
            order: [['sort_order', 'ASC']]
        })
        expect(storedImages).toHaveLength(2)
        expect(storedImages.map((image) => image.sort_order)).toEqual([0, 1])

        const detailResponse = await agent.get(
            `/api/products/${createdProduct.id}`
        )
        expect(detailResponse.status).toBe(200)
        expect(detailResponse.body.data.title).toBe(
            'Giay chay bo kiem thu'
        )

        const imageResponse = await agent.get(imageUrl)
        expect(imageResponse.status).toBe(200)
        expect(imageResponse.headers['content-type']).toBe('image/png')

        await agent.post('/api/auth/logout')
    })

    it('lists all active products and filters by canonical category', async function () {
        secondaryProduct = await Product.create({
            owner_id: testUser.id,
            title: 'Phu kien kiem thu',
            description: 'San pham phu kien de kiem tra bo loc danh muc.',
            category: 'phu-kien-chay-bo',
            price: 350000,
            stock: 4,
            weight_grams: null,
            sizes: null,
            colors: null,
            status: 'active'
        })
        inactiveProduct = await Product.create({
            owner_id: testUser.id,
            title: 'San pham an',
            description: 'San pham khong duoc xuat hien trong danh sach.',
            category: 'giay-chay-bo',
            price: 450000,
            stock: 2,
            weight_grams: null,
            sizes: null,
            colors: null,
            status: 'inactive'
        })

        const allResponse = await request(app).get('/api/products')
        const shoeResponse = await request(app)
            .get('/api/products?category=giay-chay-bo')
        const accessoryResponse = await request(app)
            .get('/api/products?category=phu-kien-chay-bo')

        expect(allResponse.status).toBe(200)
        expect(allResponse.body.data.map((product) => Number(product.id)))
            .toEqual(expect.arrayContaining([
                Number(createdProduct.id),
                Number(secondaryProduct.id)
            ]))
        expect(allResponse.body.data.map((product) => Number(product.id)))
            .not.toContain(Number(inactiveProduct.id))
        expect(shoeResponse.status).toBe(200)
        expect(shoeResponse.body.data.map((product) => Number(product.id)))
            .toContain(Number(createdProduct.id))
        expect(shoeResponse.body.data.map((product) => Number(product.id)))
            .not.toContain(Number(secondaryProduct.id))
        expect(accessoryResponse.status).toBe(200)
        expect(accessoryResponse.body.data.map((product) => Number(product.id)))
            .toContain(Number(secondaryProduct.id))
    })

    it('rejects an unsupported category filter', async function () {
        const response = await request(app)
            .get('/api/products?category=khong-hop-le')

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(response.body.message).toContain('category')
    })

    it('rejects an owner_id supplied by the client', async function () {
        const agent = await authenticatedAgent()
        const filesBeforeRequest = await getTestUserProductFiles()
        const response = await agent
            .post('/api/products')
            .field('owner_id', String(Number(testUser.id) + 1))
            .field('title', 'Spoofed owner product')
            .field(
                'description',
                'This product must not accept an owner from the client.'
            )
            .field('category', 'giay-chay-bo')
            .field('price', '500000')
            .field('stock', '2')
            .attach('images', png, {
                filename: 'spoofed-owner.png',
                contentType: 'image/png'
            })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(response.body.message).toContain('owner_id')
        expect(await Product.count({
            where: {
                title: 'Spoofed owner product'
            }
        })).toBe(0)
        expect(await getTestUserProductFiles()).toEqual(filesBeforeRequest)

        await agent.post('/api/auth/logout')
    })

    it('returns clear validation errors for invalid product data', async function () {
        const agent = await authenticatedAgent()
        const response = await agent
            .post('/api/products')
            .field('title', 'No')
            .field('description', 'Short')
            .field('category', 'Giay')
            .field('price', '0')
            .field('stock', '-1')
            .attach('images', png, {
                filename: 'invalid-product.png',
                contentType: 'image/png'
            })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(response.body.message).toContain('title')
        expect(response.body.message).toContain('price')

        await agent.post('/api/auth/logout')
    })

    it('validates category and weight', async function () {
        const agent = await authenticatedAgent()
        const response = await agent
            .post('/api/products')
            .field('title', 'Invalid category and weight')
            .field(
                'description',
                'This request contains invalid category and weight values.'
            )
            .field('price', '450000')
            .field('stock', '3')
            .field('weight_grams', '0')
            .attach('images', png, {
                filename: 'invalid-category-weight.png',
                contentType: 'image/png'
            })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(response.body.message).toContain('category')
        expect(response.body.message).toContain('weight_grams')

        await agent.post('/api/auth/logout')
    })

    it('rejects unsupported image types without leaving a file', async function () {
        const agent = await authenticatedAgent()
        const filesBeforeRequest = await getTestUserProductFiles()
        const response = await agent
            .post('/api/products')
            .attach('images', Buffer.from('plain text'), {
                filename: 'product.txt',
                contentType: 'text/plain'
            })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(response.body.message).toContain('JPEG, PNG and WebP')
        expect(await getTestUserProductFiles()).toEqual(filesBeforeRequest)

        await agent.post('/api/auth/logout')
    })

    it('rejects oversized product images', async function () {
        const agent = await authenticatedAgent()
        const filesBeforeRequest = await getTestUserProductFiles()
        const response = await agent
            .post('/api/products')
            .attach('images', Buffer.alloc(5 * 1024 * 1024 + 1, 0xff), {
                filename: 'oversized.jpg',
                contentType: 'image/jpeg'
            })

        expect(response.status).toBe(413)
        expect(response.body.success).toBe(false)
        expect(response.body.message).toContain('5 MB')
        expect(await getTestUserProductFiles()).toEqual(filesBeforeRequest)

        await agent.post('/api/auth/logout')
    })

    it('rejects more than six product images', async function () {
        const agent = await authenticatedAgent()
        const filesBeforeRequest = await getTestUserProductFiles()
        let pendingRequest = agent.post('/api/products')

        for (let index = 0; index < 7; index += 1) {
            pendingRequest = pendingRequest.attach('images', png, {
                filename: `product-${index}.png`,
                contentType: 'image/png'
            })
        }

        const response = await pendingRequest

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(await getTestUserProductFiles()).toEqual(filesBeforeRequest)

        await agent.post('/api/auth/logout')
    })

    it('rejects invalid image content and removes the uploaded file', async function () {
        const agent = await authenticatedAgent()
        const filesBeforeRequest = await getTestUserProductFiles()
        const response = await agent
            .post('/api/products')
            .field('title', 'Invalid image content')
            .field(
                'description',
                'This request pretends that plain content is a PNG image.'
            )
            .field('category', 'giay-chay-bo')
            .field('price', '600000')
            .field('stock', '4')
            .attach('images', Buffer.from('not-a-real-png-image'), {
                filename: 'fake.png',
                contentType: 'image/png'
            })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(response.body.message).toContain('Invalid product image content')
        expect(await getTestUserProductFiles()).toEqual(filesBeforeRequest)

        await agent.post('/api/auth/logout')
    })

    it('rolls back the product and removes images when image records fail', async function () {
        const agent = await authenticatedAgent()
        const filesBeforeRequest = await getTestUserProductFiles()
        const title = 'Transaction rollback product'
        const bulkCreateSpy = jest
            .spyOn(ProductImage, 'bulkCreate')
            .mockRejectedValueOnce(new Error('Simulated image database failure'))

        try {
            const response = await agent
                .post('/api/products')
                .field('title', title)
                .field(
                    'description',
                    'This product must be rolled back when image storage fails.'
                )
                .field('category', 'giay-chay-bo')
                .field('price', '700000')
                .field('stock', '5')
                .attach('images', png, {
                    filename: 'rollback.png',
                    contentType: 'image/png'
                })

            expect(response.status).toBe(500)
            expect(response.body.success).toBe(false)
            expect(await Product.count({ where: { title } })).toBe(0)
            expect(await getTestUserProductFiles()).toEqual(filesBeforeRequest)
        } finally {
            bulkCreateSpy.mockRestore()
            await agent.post('/api/auth/logout')
        }
    })
})
