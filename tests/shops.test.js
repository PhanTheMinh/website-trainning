const request = require('supertest')

const app = require('../src/app')
const sequelize = require('../src/config/database')
const {
    Category,
    Product,
    ProductVariant,
    Shop,
    User
} = require('../src/models')
const { hashPassword } = require('../src/utils/hash')

const testRun = Date.now()
const sellerEmail = `shop-seller-${testRun}@example.com`
const otherEmail = `shop-other-${testRun}@example.com`
let seller
let otherSeller
let category
let shop
let otherShop
let product
let variant

async function authenticatedAgent(email = sellerEmail) {
    const agent = request.agent(app)
    const response = await agent.post('/api/auth/login').send({
        email,
        password: '123456'
    })

    expect(response.status).toBe(200)
    return agent
}

async function createShopProduct(owner, targetShop, suffix) {
    const createdProduct = await Product.create({
        owner_id: owner.id,
        shop_id: targetShop.id,
        title: `Shop product ${suffix} ${testRun}`,
        description: 'A valid product description for public shop testing.',
        category: category.slug,
        category_id: category.id,
        brand: 'Shop Test',
        price: 750000,
        stock: 0,
        weight_grams: 350,
        sizes: null,
        colors: null,
        status: 'active'
    })
    const createdVariant = await ProductVariant.create({
        product_id: createdProduct.id,
        sku: `SHOP-${testRun}-${suffix}`,
        variant_key: 'default',
        price: null,
        image_url: null,
        stock_quantity: 5,
        status: 'active',
        is_default: true
    })

    return { product: createdProduct, variant: createdVariant }
}

describe('Public and seller shop APIs', function () {
    beforeAll(async function () {
        category = await Category.findOne({
            where: { slug: 'giay-chay-bo' }
        })
        seller = await User.create({
            full_name: 'Shop Seller',
            email: sellerEmail,
            phone: null,
            address: null,
            password: await hashPassword('123456'),
            role: 'user',
            status: 'active'
        })
        otherSeller = await User.create({
            full_name: 'Other Shop Seller',
            email: otherEmail,
            phone: null,
            address: null,
            password: await hashPassword('123456'),
            role: 'user',
            status: 'active'
        })

        const agent = await authenticatedAgent()
        const createResponse = await agent.post('/api/shops').send({
            name: 'RunStore Hà Nội',
            description: 'Cửa hàng đồ chạy bộ chính hãng.',
            logo_url: 'https://example.com/logo.png'
        })

        expect(createResponse.status).toBe(201)
        shop = await Shop.findByPk(createResponse.body.data.id)
        otherShop = await Shop.create({
            owner_user_id: otherSeller.id,
            name: 'Other Run Shop',
            slug: `other-run-shop-${testRun}`,
            status: 'active'
        })
        const created = await createShopProduct(seller, shop, 'PRIMARY')
        product = created.product
        variant = created.variant
        await createShopProduct(otherSeller, otherShop, 'OTHER')
    })

    afterAll(async function () {
        await User.destroy({
            where: { id: [seller.id, otherSeller.id] }
        })
        await sequelize.close()
    })

    it('returns a safe public DTO and canonical id-slug identifier', async function () {
        const response = await request(app).get(`/api/shops/${shop.id}-old-slug`)

        expect(response.status).toBe(200)
        expect(response.body.data).toMatchObject({
            id: Number(shop.id),
            name: 'RunStore Hà Nội',
            identifier: `${shop.id}-${shop.slug}`,
            product_count: 1,
            status: 'active'
        })
        expect(response.body.data).not.toHaveProperty('owner')
        expect(response.body.data).not.toHaveProperty('email')
    })

    it('lists only active products that belong to the requested shop', async function () {
        const response = await request(app).get(
            `/api/shops/${shop.id}-${shop.slug}/products?limit=20`
        )

        expect(response.status).toBe(200)
        expect(response.body.pagination.totalItems).toBe(1)
        expect(response.body.data).toHaveLength(1)
        expect(Number(response.body.data[0].id)).toBe(Number(product.id))
        expect(response.body.data[0].shop.identifier)
            .toBe(`${shop.id}-${shop.slug}`)
    })

    it('embeds the public shop in product detail and purchase validation', async function () {
        const detail = await request(app).get(`/api/products/${product.id}`)
        const purchase = await request(app)
            .post('/api/products/purchase-validation')
            .send({
                items: [{
                    product_id: product.id,
                    variant_id: variant.id,
                    quantity: 1
                }]
            })

        expect(detail.status).toBe(200)
        expect(detail.body.data.shop.identifier).toBe(`${shop.id}-${shop.slug}`)
        expect(purchase.status).toBe(200)
        expect(purchase.body.data.items[0].shop_id).toBe(Number(shop.id))
    })

    it('lets an owner edit and close the shop, then blocks public buying', async function () {
        const agent = await authenticatedAgent()
        const update = await agent.patch('/api/shops/me').send({
            name: 'RunStore Hà Nội Mới',
            status: 'closed'
        })

        expect(update.status).toBe(200)
        expect(update.body.data.status).toBe('closed')
        const closedShop = await request(app).get(`/api/shops/${shop.id}`)
        const closedCatalog = await request(app).get(
            `/api/shops/${shop.id}/products`
        )
        const closedProduct = await request(app).get(
            `/api/products/${product.id}`
        )
        const blockedPurchase = await request(app)
            .post('/api/products/purchase-validation')
            .send({
                items: [{
                    product_id: product.id,
                    variant_id: variant.id,
                    quantity: 1
                }]
            })

        expect(closedShop.status).toBe(200)
        expect(closedShop.body.data).toMatchObject({
            status: 'closed',
            product_count: 0
        })
        expect(closedCatalog.status).toBe(409)
        expect(closedCatalog.body.code).toBe('SHOP_CLOSED')
        expect(closedProduct.status).toBe(200)
        expect(closedProduct.body.data).toMatchObject({
            available: false,
            status: 'active'
        })
        expect(closedProduct.body.data.shop.status).toBe('closed')
        expect(closedProduct.body.data.variants).toHaveLength(0)
        expect(blockedPurchase.status).toBe(409)
        expect(blockedPurchase.body.code).toBe('SHOP_CLOSED')

        const reopen = await agent.patch('/api/shops/me').send({
            status: 'active'
        })
        expect(reopen.status).toBe(200)
        const reopenedProduct = await request(app).get(
            `/api/products/${product.id}`
        )
        expect(reopenedProduct.status).toBe(200)
        expect(reopenedProduct.body.data.available).toBe(true)
    })

    it('prevents an account from creating a second shop', async function () {
        const agent = await authenticatedAgent()
        const response = await agent.post('/api/shops').send({
            name: 'Duplicate shop'
        })

        expect(response.status).toBe(409)
    })
})
