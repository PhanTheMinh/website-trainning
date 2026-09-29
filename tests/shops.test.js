const request = require('supertest')

const app = require('../src/app')
const sequelize = require('../src/config/database')
const {
    Category,
    Product,
    ProductVariant,
    ShippingMethod,
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
        price: 750000,
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

    it('creates, lists and toggles shop-owned shipping methods', async function () {
        const agent = await authenticatedAgent()
        const otherAgent = await authenticatedAgent(otherEmail)
        const unauthorized = await request(app)
            .get('/api/shops/me/shipping-methods')

        expect(unauthorized.status).toBe(401)

        const created = await agent
            .post('/api/shops/me/shipping-methods')
            .send({
                name: 'Vận chuyển hỏa tốc',
                description: 'Giao nhanh trong nội thành.',
                status: 'active'
            })

        expect(created.status).toBe(201)
        expect(created.body.data).toMatchObject({
            name: 'Vận chuyển hỏa tốc',
            code: 'van-chuyen-hoa-toc',
            status: 'active'
        })

        const duplicate = await agent
            .post('/api/shops/me/shipping-methods')
            .send({
                name: 'Vận chuyển hỏa tốc'
            })
        expect(duplicate.status).toBe(409)

        const list = await agent.get('/api/shops/me/shipping-methods')
        expect(list.status).toBe(200)
        expect(list.body.data).toHaveLength(1)
        expect(list.body.pagination).toMatchObject({
            page: 1,
            limit: 8,
            totalItems: 1,
            totalPages: 1
        })

        const searched = await agent.get(
            '/api/shops/me/shipping-methods?page=1&limit=1&q=hỏa+tốc&status=active&sort=name_desc'
        )
        expect(searched.status).toBe(200)
        expect(searched.body.data).toHaveLength(1)
        expect(searched.body.data[0].name).toBe('Vận chuyển hỏa tốc')
        expect(searched.body.pagination.limit).toBe(1)

        const invalidList = await agent.get(
            '/api/shops/me/shipping-methods?page=0&sort=unknown'
        )
        expect(invalidList.status).toBe(400)

        const hiddenFromOtherOwner = await otherAgent
            .patch(`/api/shops/me/shipping-methods/${created.body.data.id}/status`)
            .send({ status: 'inactive' })
        expect(hiddenFromOtherOwner.status).toBe(404)

        const toggled = await agent
            .patch(`/api/shops/me/shipping-methods/${created.body.data.id}/status`)
            .send({ status: 'inactive' })
        expect(toggled.status).toBe(200)
        expect(toggled.body.data.status).toBe('inactive')

        const storedMethod = await ShippingMethod.findByPk(created.body.data.id)
        expect(storedMethod.status).toBe('inactive')
    })

    it('creates and isolates shipping countries by shop', async function () {
        const agent = await authenticatedAgent()
        const otherAgent = await authenticatedAgent(otherEmail)

        const invalid = await agent.post('/api/shops/me/countries').send({
            name: 'Việt Nam',
            country_code: 'VNM',
            phone_code: '84'
        })
        expect(invalid.status).toBe(400)

        const vietnam = await agent.post('/api/shops/me/countries').send({
            name: 'Việt Nam',
            country_code: 'vn',
            phone_code: '+84'
        })
        const unitedStates = await agent.post('/api/shops/me/countries').send({
            name: 'Hoa Kỳ',
            country_code: 'US',
            phone_code: '+1'
        })
        const unitedKingdom = await otherAgent.post('/api/shops/me/countries').send({
            name: 'Vương quốc Anh',
            country_code: 'GB',
            phone_code: '+44'
        })

        expect(vietnam.status).toBe(201)
        expect(vietnam.body.data).toMatchObject({
            name: 'Việt Nam',
            country_code: 'VN',
            phone_code: '+84'
        })
        expect(unitedStates.status).toBe(201)
        expect(unitedKingdom.status).toBe(201)

        const duplicate = await agent.post('/api/shops/me/countries').send({
            name: 'Vietnam',
            country_code: 'VN',
            phone_code: '+84'
        })
        expect(duplicate.status).toBe(409)

        const list = await agent.get('/api/shops/me/countries')
        expect(list.status).toBe(200)
        expect(list.body.data).toHaveLength(2)
        expect(list.body.data.map((country) => country.country_code)).not.toContain('GB')
        expect(list.body.pagination).toMatchObject({
            page: 1,
            limit: 8,
            totalItems: 2,
            totalPages: 1
        })

        const searched = await agent.get(
            '/api/shops/me/countries?page=1&limit=1&q=Việt'
        )
        expect(searched.status).toBe(200)
        expect(searched.body.data).toHaveLength(1)
        expect(searched.body.data[0].country_code).toBe('VN')
        expect(searched.body.pagination.limit).toBe(1)
    })

    it('creates rates for multiple countries and protects ownership', async function () {
        const agent = await authenticatedAgent()
        const otherAgent = await authenticatedAgent(otherEmail)
        const countries = (await agent.get('/api/shops/me/countries')).body.data
        const otherCountries = (await otherAgent.get('/api/shops/me/countries')).body.data

        const method = await agent.post('/api/shops/me/shipping-methods').send({
            name: 'Vận chuyển tiêu chuẩn'
        })
        const otherMethod = await otherAgent.post('/api/shops/me/shipping-methods').send({
            name: 'Other standard shipping'
        })
        expect(method.status).toBe(201)
        expect(otherMethod.status).toBe(201)

        const invalidRange = await agent.post('/api/shops/me/shipping-rates').send({
            shipping_method_id: method.body.data.id,
            country_ids: [countries[0].id],
            min_delivery_days: 7,
            max_delivery_days: 3,
            fixed_fee: 30000
        })
        expect(invalidRange.status).toBe(400)

        const foreignCountry = await otherAgent.post('/api/shops/me/shipping-rates').send({
            shipping_method_id: otherMethod.body.data.id,
            country_ids: [countries[0].id],
            min_delivery_days: 3,
            max_delivery_days: 7,
            fixed_fee: 30000
        })
        expect(foreignCountry.status).toBe(404)

        const created = await agent.post('/api/shops/me/shipping-rates').send({
            shipping_method_id: method.body.data.id,
            country_ids: countries.map((country) => country.id),
            min_delivery_days: 3,
            max_delivery_days: 7,
            fixed_fee: 30000
        })
        expect(created.status).toBe(201)
        expect(created.body.data).toMatchObject({
            shipping_method_id: method.body.data.id,
            min_delivery_days: 3,
            max_delivery_days: 7,
            fixed_fee: 30000
        })
        expect(created.body.data.countries).toHaveLength(2)

        const list = await agent.get(
            '/api/shops/me/shipping-rates?page=1&limit=1&q=tiêu+chuẩn'
        )
        expect(list.status).toBe(200)
        expect(list.body.data).toHaveLength(1)
        expect(list.body.data[0].shipping_method.name)
            .toBe('Vận chuyển tiêu chuẩn')
        expect(list.body.pagination).toMatchObject({
            page: 1,
            limit: 1,
            totalItems: 1,
            totalPages: 1
        })

        const detail = await agent.get(
            `/api/shops/me/shipping-rates/${created.body.data.id}`
        )
        expect(detail.status).toBe(200)
        expect(detail.body.data.countries).toHaveLength(2)

        const hiddenDetail = await otherAgent.get(
            `/api/shops/me/shipping-rates/${created.body.data.id}`
        )
        expect(hiddenDetail.status).toBe(404)

        const hiddenUpdate = await otherAgent
            .patch(`/api/shops/me/shipping-rates/${created.body.data.id}`)
            .send({
                shipping_method_id: otherMethod.body.data.id,
                country_ids: otherCountries.map((country) => country.id),
                min_delivery_days: 2,
                max_delivery_days: 5,
                fixed_fee: 45000
            })
        expect(hiddenUpdate.status).toBe(404)

        const updated = await agent
            .patch(`/api/shops/me/shipping-rates/${created.body.data.id}`)
            .send({
                shipping_method_id: method.body.data.id,
                country_ids: countries.map((country) => country.id),
                min_delivery_days: 2,
                max_delivery_days: 5,
                fixed_fee: 45000
            })
        expect(updated.status).toBe(200)
        expect(updated.body.data).toMatchObject({
            min_delivery_days: 2,
            max_delivery_days: 5,
            fixed_fee: 45000
        })
        expect(updated.body.data.countries).toHaveLength(2)

        const fastMethod = await agent.post('/api/shops/me/shipping-methods').send({
            name: 'Vận chuyển nhanh'
        })
        expect(fastMethod.status).toBe(201)
        const fastRate = await agent.post('/api/shops/me/shipping-rates').send({
            shipping_method_id: fastMethod.body.data.id,
            country_ids: [countries.find((country) => country.country_code === 'VN').id],
            min_delivery_days: 1,
            max_delivery_days: 2,
            fixed_fee: 15000
        })
        expect(fastRate.status).toBe(201)

        const quote = await request(app)
            .post('/api/checkout/shipping-options')
            .send({ shop_ids: [shop.id], country_code: 'VN' })
        expect(quote.status).toBe(200)
        expect(quote.body.data.destinations.map((country) => country.country_code))
            .toContain('VN')
        expect(quote.body.data.shipping[0].options.map((option) => option.fixed_fee))
            .toEqual([15000, 45000])

        const unsupported = await request(app)
            .post('/api/checkout/shipping-options')
            .send({ shop_ids: [shop.id], country_code: 'AU' })
        expect(unsupported.status).toBe(200)
        expect(unsupported.body.data.shipping[0].options).toHaveLength(0)

        const invalidQuote = await request(app)
            .post('/api/checkout/shipping-options')
            .send({ shop_ids: [shop.id], country_code: 'USA' })
        expect(invalidQuote.status).toBe(400)

        const overlapping = await agent.post('/api/shops/me/shipping-rates').send({
            shipping_method_id: method.body.data.id,
            country_ids: [countries[0].id],
            min_delivery_days: 2,
            max_delivery_days: 4,
            fixed_fee: 50000
        })
        expect(overlapping.status).toBe(409)

        const cannotDeleteUsedCountry = await agent.delete(
            `/api/shops/me/countries/${countries[0].id}`
        )
        expect(cannotDeleteUsedCountry.status).toBe(409)

        const otherList = await otherAgent.get('/api/shops/me/shipping-rates')
        expect(otherList.status).toBe(200)
        expect(otherList.body.data).toHaveLength(0)
        expect(otherList.body.pagination.totalItems).toBe(0)
        expect(otherCountries).toHaveLength(1)

        const deletedRate = await agent.delete(
            `/api/shops/me/shipping-rates/${created.body.data.id}`
        )
        expect(deletedRate.status).toBe(204)
        expect((await agent.delete(
            `/api/shops/me/shipping-rates/${fastRate.body.data.id}`
        )).status).toBe(204)

        const deletedCountry = await agent.delete(
            `/api/shops/me/countries/${countries[0].id}`
        )
        expect(deletedCountry.status).toBe(204)
    })
})
