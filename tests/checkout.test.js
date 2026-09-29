const request = require('supertest')
const { v4: uuid } = require('uuid')
const app = require('../src/app')
const sequelize = require('../src/config/database')
const { User, Shop, Category, Product, ProductVariant, ProductImage, ProductVariantImage, Country, ShippingMethod, ShippingRate, CheckoutToken, PaymentMethod } = require('../src/models')
const { hashPassword } = require('../src/utils/hash')

const users = []
const shops = []
const variants = []
const items = []
const rates = []
const paymentMethods = []
let owner
let other
const stamp = Date.now()
async function create(agent = owner, requestId = uuid()) {
    const response = await agent.post('/api/checkout').send({ request_id: requestId, items })
    expect(response.status).toBe(201)
    return response.body.data
}
describe('Checkout persistence and server totals', () => {
    beforeAll(async () => {
        const category = await Category.findOne({ where: { slug: 'giay-chay-bo' } })
        for (let i = 0; i < 2; i++) {
            const user = await User.create({ full_name: 'Checkout tester', email: `checkout-${stamp}-${i}@example.com`,
                password: await hashPassword('123456'), role: 'user', status: 'active' })
            users.push(user)
            const shop = await Shop.create({ owner_user_id: user.id, name: `Checkout shop ${i}`, slug: `checkout-${stamp}-${i}`, status: 'active' })
            shops.push(shop)
            const product = await Product.create({ owner_id: user.id, shop_id: shop.id, title: 'Checkout shoe',
                description: 'Test checkout persistence and calculations.', category: category.slug, category_id: category.id,
                brand: 'Test', price: 100000, stock: 0, weight_grams: 300, status: 'active' })
            const variant = await ProductVariant.create({ product_id: product.id, sku: `CHECKOUT-${stamp}-${i}`,
                variant_key: 'default', price: i ? 50000 : 100000, stock_quantity: 10, status: 'active', is_default: true })
            variants.push(variant)
            items.push({ product_id: Number(product.id), variant_id: Number(variant.id), quantity: 2 })
            const country = await Country.create({ shop_id: shop.id, name: 'Vietnam', country_code: 'VN', phone_code: '+84' })
            const method = await ShippingMethod.create({ shop_id: shop.id, name: 'Standard', code: 'standard', status: 'active' })
            const rate = await ShippingRate.create({ shipping_method_id: method.id, min_delivery_days: 1, max_delivery_days: 3, fixed_fee: i ? 20000 : 30000 })
            await rate.addCountry(country)
            rates.push(rate)
            paymentMethods.push(await PaymentMethod.create({
                user_id: user.id,
                name: 'Thanh toán khi nhận hàng',
                payment_data: { type: 'cod', description: 'Pay when the order arrives', instructions: null },
                is_active: true,
                is_deleted: false
            }))
        }
        owner = request.agent(app)
        other = request.agent(app)
        for (const [index, agent] of [owner, other].entries()) {
            expect((await agent.post('/api/auth/login').send({ email: users[index].email, password: '123456' })).status).toBe(200)
        }
    })
    afterAll(async () => {
        try {
            await CheckoutToken.destroy({ where: { user_id: users.map(user => user.id) } })
            await ShippingRate.destroy({ where: { id: rates.map(rate => rate.id) } })
            await User.destroy({ where: { id: users.map(user => user.id) } })
        } finally { await sequelize.close() }
    })
    it('creates distinct UUIDs, retries the same request without duplication, and isolates accounts', async () => {
        const key = uuid()
        const a = await create(owner, key)
        expect((await create(owner, key)).token).toBe(a.token)
        expect((await create()).token).not.toBe(a.token)
        const b = await create(other, key)
        expect(b.token).not.toBe(a.token)
        expect(a.total).toEqual({ subtotal: 300000, shipping_fee: null, amount_due: null })
        expect((await other.get(`/api/checkout/${a.token}`)).status).toBe(404)
        expect((await other.patch(`/api/checkout/${a.token}`).send({ version: 1, shipping_address: { city: 'Other' } })).status).toBe(404)
        const list = await other.get('/api/checkout')
        expect(list.body.data.items.map(item => item.token)).toContain(b.token)
        expect(list.body.data.items.map(item => item.token)).not.toContain(a.token)
    })
    it('restores products and partial address from DB and computes shipping per shop', async () => {
        const draft = await create()
        const patch = await owner.patch(`/api/checkout/${draft.token}`).send({ version: 1,
            shipping_address: { email: 'unfinished@', city: 'Hanoi', country_code: 'VN', country_name: 'Incorrect', province_state: 'Hải Dương', province_code: 'Incorrect', zip_code: '03127' },
            shipping_selections: { [shops[0].id]: Number(rates[0].id), [shops[1].id]: Number(rates[1].id) } })
        expect(patch.status).toBe(200)
        expect(patch.body.data.shipping_address).toMatchObject({ country_name: 'Việt Nam', province_code: 'HD' })
        expect(patch.body.data.total).toEqual({ subtotal: 300000, shipping_fee: 50000, amount_due: 350000 })
        const fresh = request.agent(app)
        await fresh.post('/api/auth/login').send({ email: users[0].email, password: '123456' })
        const restored = await fresh.get(`/api/checkout/${draft.token}`)
        expect(restored.body.data.shipping_address.email).toBe('unfinished@')
        expect(restored.body.data.shipping_address.zip_code).toBe('03127')
        expect(restored.body.data.items).toHaveLength(2)
        const changed = await fresh.patch(`/api/checkout/${draft.token}`).send({ version: 2, shipping_address: { phone: '0123' } })
        expect(changed.body.data.shipping_address).toMatchObject({ city: 'Hanoi', phone: '0123' })
        const invalid = await fresh.patch(`/api/checkout/${draft.token}`).send({ version: 3, shipping_address: { country_code: 'US' } })
        expect(invalid.status).toBe(200)
        expect(invalid.body.data.total.amount_due).toBeNull()
    })
    it('rejects forged totals, foreign shipping rates, missing tokens and stale writes', async () => {
        const draft = await create()
        expect((await owner.patch(`/api/checkout/${draft.token}`).send({ version: 1, total: { amount_due: 1 }, shipping_address: {} })).status).toBe(400)
        const invalid = await owner.patch(`/api/checkout/${draft.token}`).send({ version: 1,
            shipping_address: { country_code: 'VN' }, shipping_selections: { [shops[0].id]: Number(rates[1].id) } })
        expect(invalid.body.data.total.amount_due).toBeNull()
        const concurrent = await Promise.all(['A', 'B'].map(city => owner.patch(`/api/checkout/${draft.token}`).send({ version: 2, shipping_address: { city } })))
        expect(concurrent.map(response => response.status).sort()).toEqual([200, 409])
        expect((await owner.patch(`/api/checkout/${uuid()}`).send({ version: 1, shipping_address: {} })).status).toBe(404)
        expect((await owner.get('/api/checkout/invalid')).status).toBe(400)
        expect((await request(app).get(`/api/checkout/${draft.token}`)).status).toBe(401)
    })
    it('persists product quantity edits and recalculates totals on every update', async () => {
        const draft = await create()
        const changedItems = items.map((item, index) => ({ ...item, quantity: index ? 2 : 3 }))
        const saved = await owner.patch(`/api/checkout/${draft.token}`).send({ version: 1, items: changedItems,
            shipping_address: { country_code: 'VN' },
            shipping_selections: { [shops[0].id]: Number(rates[0].id), [shops[1].id]: Number(rates[1].id) } })
        expect(saved.status).toBe(200)
        expect(saved.body.data.total).toEqual({ subtotal: 400000, shipping_fee: 50000, amount_due: 450000 })
        const restored = await owner.get(`/api/checkout/${draft.token}`)
        expect(restored.body.data.items.find(item => item.variant_id === items[0].variant_id).quantity).toBe(3)
    })
    it('offers COD for all shops, persists it, and rejects unavailable payment methods', async () => {
        const draft = await create()
        expect(draft.payment_options).toHaveLength(1)
        expect(draft.payment_options[0]).toMatchObject({ type: 'cod', name: 'Cash on delivery' })
        expect(draft.payment_options[0].shop_details).toHaveLength(2)

        const selected = await owner.patch(`/api/checkout/${draft.token}`).send({
            version: 1,
            payment_method_id: draft.payment_options[0].id
        })
        expect(selected.status).toBe(200)
        expect(selected.body.data.payment_selection).toMatchObject({ type: 'cod' })

        const restored = await owner.get(`/api/checkout/${draft.token}`)
        expect(restored.body.data.payment_selection.id).toBe(draft.payment_options[0].id)

        await paymentMethods[1].update({ is_active: false })
        const unavailable = await owner.get(`/api/checkout/${draft.token}`)
        expect(unavailable.body.data.payment_options).toEqual([])
        expect(unavailable.body.data.payment_selection).toBeNull()
        expect(unavailable.body.data.payment_issue).toMatch(/no longer available/i)
        expect((await owner.patch(`/api/checkout/${draft.token}`).send({
            version: 2,
            payment_method_id: draft.payment_options[0].id
        })).status).toBe(409)
        await paymentMethods[1].update({ is_active: true })
    })
    it('loads variant gallery images with product gallery fallbacks', async () => {
        await ProductImage.create({ product_id: items[0].product_id, image_url: '/uploads/product-cover.png', sort_order: 0 })
        let draft = await create()
        expect(draft.items.find(item => item.variant_id === items[0].variant_id).image_url).toBe('/uploads/product-cover.png')
        await ProductVariantImage.create({ product_variant_id: items[0].variant_id, image_url: '/uploads/variant-cover.png', sort_order: 0 })
        draft = (await owner.get(`/api/checkout/${draft.token}`)).body.data
        expect(draft.items.find(item => item.variant_id === items[0].variant_id).image_urls).toEqual(['/uploads/variant-cover.png', '/uploads/product-cover.png'])
    })
    it('keeps entered address when stock changes, recalculates current prices, and locks completed drafts', async () => {
        const draft = await create()
        await variants[0].update({ price: 120000 })
        expect((await owner.get(`/api/checkout/${draft.token}`)).body.data.total.subtotal).toBe(340000)
        await variants[0].update({ stock_quantity: 0 })
        const saved = await owner.patch(`/api/checkout/${draft.token}`).send({ version: 1, shipping_address: { city: 'Saved despite stock' } })
        expect(saved.status).toBe(200)
        expect(saved.body.data.shipping_address.city).toBe('Saved despite stock')
        expect(saved.body.data.total.amount_due).toBeNull()
        expect(saved.body.data.issues.length).toBeGreaterThan(0)
        await CheckoutToken.update({ is_completed: true }, { where: { checkout_token: draft.token } })
        expect((await owner.patch(`/api/checkout/${draft.token}`).send({ version: 2, shipping_address: {} })).status).toBe(409)
        await variants[0].update({ stock_quantity: 10, price: 100000 })
    })
})
