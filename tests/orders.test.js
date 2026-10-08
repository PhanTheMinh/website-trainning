const request = require('supertest')
const { v4: uuid } = require('uuid')
const app = require('../src/app')
const sequelize = require('../src/config/database')
const { User, Shop, Category, Product, ProductVariant, Country, ShippingMethod, ShippingRate,
    PaymentMethod, CheckoutToken, Customer, Order, OrderItem, OrderAddress } = require('../src/models')
const { hashPassword } = require('../src/utils/hash')
const { deliveryDate, cents, money } = require('../src/services/orders.service')
const users = []
const shops = []
const variants = []
const rates = []
const methods = []
const payments = []
const stamp = Date.now()
const email = `order-customer-${stamp}@example.com`
const simplifiedEmail = `order-simple-${stamp}@example.com`
let buyer, other
const items = () => variants.map(variant => ({ product_id: Number(variant.product_id), variant_id: Number(variant.id), quantity: 2 }))
async function draft(address = {}) {
    const response = await buyer.post('/api/checkout').send({ request_id: uuid(), items: items() })
    expect(response.status).toBe(201)
    const saved = await buyer.patch(`/api/checkout/${response.body.data.token}`).send({ version: 1,
        shipping_address: { first_name: 'Order', last_name: 'Buyer', email: ` ${email.toUpperCase()} `,
            phone: '+84901234567', country_code: 'VN', province_state: 'Hải Dương', city: 'Hanoi',
            street: 'Test street', house_number: '12', apartment: 'A3', ward: 'Ward 1', zip_code: '03127', ...address },
        shipping_selections: Object.fromEntries(shops.map((shop, i) => [shop.id, Number(rates[i].id)])),
        payment_method_id: response.body.data.payment_options[0].id })
    expect(saved.status).toBe(200)
    return saved.body.data
}
const payload = d => ({ checkout_token: d.token, version: d.version, request_id: uuid() })
describe('Atomic create order and historical snapshots', () => {
    beforeAll(async () => {
        const category = await Category.findOne({ where: { slug: 'giay-chay-bo' } })
        for (let i = 0; i < 2; i++) {
            const user = await User.create({ full_name: 'Order tester', email: `order-user-${stamp}-${i}@example.com`,
                password: await hashPassword('123456'), role: 'user', status: 'active' })
            users.push(user)
            const shop = await Shop.create({ owner_user_id: user.id, name: `Order shop ${i}`, slug: `order-${stamp}-${i}`, status: 'active' })
            shops.push(shop)
            const product = await Product.create({ owner_id: user.id, shop_id: shop.id, title: `Order shoe ${i}`,
                description: 'Test order creation.', category: category.slug, category_id: category.id,
                price: 100000, stock: 100, status: 'active' })
            variants.push(await ProductVariant.create({ product_id: product.id, sku: `ORD-TEST-${stamp}-${i}`,
                variant_key: 'default', price: i ? '50000.25' : '100000.10', stock_quantity: 100, status: 'active', is_default: true }))
            const country = await Country.create({ shop_id: shop.id, name: 'Vietnam', country_code: 'VN', phone_code: '+84' })
            const method = await ShippingMethod.create({ shop_id: shop.id, name: i ? 'Express' : 'Standard', code: i ? 'express' : 'standard', status: 'active' })
            methods.push(method)
            const rate = await ShippingRate.create({ shipping_method_id: method.id, min_delivery_days: 1, max_delivery_days: 3, fixed_fee: i ? 20000 : 30000 })
            await rate.addCountry(country)
            rates.push(rate)
            payments.push(await PaymentMethod.create({ user_id: user.id, name: 'Cash on delivery',
                payment_data: { type: 'cod', instructions: 'Pay the courier' }, is_active: true, is_deleted: false }))
        }
        buyer = request.agent(app)
        other = request.agent(app)
        for (const [i, agent] of [buyer, other].entries()) {
            expect((await agent.post('/api/auth/login').send({ email: users[i].email, password: '123456' })).status).toBe(200)
        }
    })
    afterAll(async () => {
        try {
            const orders = await Order.findAll({ where: { user_id: users.map(user => user.id) } })
            const ids = orders.map(order => order.id)
            await require('../src/models').OrderEvent.destroy({ where: { order_id: ids } })
            for (const model of [OrderItem, OrderAddress]) await model.destroy({ where: { order_id: ids } })
            await Order.destroy({ where: { id: ids } })
            await Customer.destroy({ where: { email_key: [email, simplifiedEmail] } })
            await CheckoutToken.destroy({ where: { user_id: users.map(user => user.id) } })
            await ShippingRate.destroy({ where: { id: rates.map(rate => rate.id) } })
            await User.destroy({ where: { id: users.map(user => user.id) } })
        } finally { await sequelize.close() }
    })
    it('uses exact cents and calendar dates in Vietnam timezone', () => {
        expect(money(cents('100000.10') * 2)).toBe('200000.20')
        expect(() => cents('1.001')).toThrow()
        expect(deliveryDate(1, new Date('2026-09-30T18:00:00Z'))).toBe('2026-10-02')
    })
    it('creates one order per shop, snapshot address/payment, and decrements inventory exactly once', async () => {
        const d = await draft()
        const data = payload(d)
        const [a, b] = await Promise.all([buyer.post('/api/orders').send(data), buyer.post('/api/orders').send(data)])
        expect([a.status, b.status]).toEqual([201, 201])
        expect(a.body.data.orders.map(order => order.id)).toEqual(b.body.data.orders.map(order => order.id))
        expect(a.body.data.orders).toHaveLength(2)
        const orders = a.body.data.orders
        expect(orders[0]).toMatchObject({ sub_total: '200000.20', shipping_fee: '30000.00', order_total: '230000.20', status: 'pending' })
        expect(orders[1].order_total).toBe('120000.50')
        expect(orders[0].shipping_method_name).toBe('Standard')
        expect(orders[1].shipping_method_name).toBe('Express')
        expect(orders[0].address).toMatchObject({ email, street: 'Test street', house_number: '12', postal_code: '03127' })
        expect(orders[0].payment_method_data).toMatchObject({ type: 'cod', name: 'Cash on delivery' })
        expect(orders[0].payment_status).toBe('unpaid')
        expect((await variants[0].reload()).stock_quantity).toBe(98)
        expect((await buyer.post('/api/orders').send({ ...data, request_id: uuid() })).body.data.orders.map(order => order.id)).toEqual(orders.map(order => order.id))
        expect((await variants[0].reload()).stock_quantity).toBe(98)
        expect((await other.get(`/api/checkout/${d.token}/orders`)).status).toBe(404)
        expect((await other.get(`/api/orders/${orders[0].id}`)).status).toBe(404)
        expect((await request(app).get(`/api/orders/${orders[0].id}`)).status).toBe(401)
        await variants[0].update({ price: '100001.10' })
        await methods[0].update({ name: 'Changed method' })
        await payments[0].update({ payment_data: { type: 'cod', instructions: 'Changed instruction' } })
        const detail = await buyer.get(`/api/orders/${orders[0].id}`)
        expect(detail.body.data.items[0].unit_price).toBe('100000.10')
        expect(detail.body.data.shipping_method_name).toBe('Standard')
        expect(detail.body.data.payment_method_data.instructions).toBe('Pay the courier')
        expect((await buyer.get(`/api/checkout/${d.token}/orders`)).body.data.orders).toHaveLength(2)
        expect((await buyer.post('/api/orders').send({ ...payload(await draft()), request_id: data.request_id })).body.code).toBe('IDEMPOTENCY_CONFLICT')
        await variants[0].update({ price: '100000.10' })
    })
    it('lists only the authenticated seller shop orders, even when the buyer is another user', async () => {
        const a = await buyer.get('/api/shops/me/orders')
        const b = await other.get('/api/shops/me/orders')
        expect(a.status).toBe(200)
        expect(b.status).toBe(200)
        expect(a.body.pagination.totalItems).toBe(1)
        expect(b.body.pagination.totalItems).toBe(1)
        expect(a.body.data[0]).toMatchObject({ shop_id: shops[0].id, item_quantity: 2,
            recipient_name: 'Order Buyer', order_status: 'pending', financial_status: 'unpaid', order_total: '230000.20' })
        expect(b.body.data[0]).toMatchObject({ shop_id: shops[1].id, order_total: '120000.50' })
        expect(a.body.data[0].id).not.toBe(b.body.data[0].id)
        for (const field of ['checkout_id', 'user_id', 'customer_id', 'items', 'address', 'payment_method_data']) {
            expect(a.body.data[0]).not.toHaveProperty(field)
        }
        const foreignCode = await buyer.get('/api/shops/me/orders').query({ q: b.body.data[0].order_code })
        expect(foreignCode.body.pagination.totalItems).toBe(0)
        expect(foreignCode.body.data).toEqual([])
        const byRecipient = await other.get('/api/shops/me/orders').query({ q: 'Buyer', financial_status: 'unpaid' })
        expect(byRecipient.body.pagination.totalItems).toBe(1)
        expect((await buyer.get('/api/shops/me/orders').query({ q: '%' })).body.data).toEqual([])
        expect((await buyer.get('/api/shops/me/orders').query({ financial_status: 'paid' })).body.data).toEqual([])
        const page = await buyer.get('/api/shops/me/orders').query({ page: 2, limit: 1 })
        expect(page.body.data).toEqual([])
        expect(page.body.pagination).toMatchObject({ page: 2, limit: 1, totalItems: 1, totalPages: 1 })
        expect((await request(app).get('/api/shops/me/orders')).status).toBe(401)
        for (const query of [{ shop_id: shops[1].id }, { user_id: users[1].id }, { page: 0 }, { limit: 101 },
            { sort: 'invalid' }, { order_status: 'invalid' }, { financial_status: 'invalid' }]) {
            expect((await buyer.get('/api/shops/me/orders').query(query)).status).toBe(400)
        }
    })
    it('rejects sellers without a shop or with a suspended shop, while allowing closed shops to view existing orders', async () => {
        const user = await User.create({ full_name: 'No shop', email: `order-no-shop-${stamp}@example.com`,
            password: await hashPassword('123456'), role: 'user', status: 'active' })
        try {
            const agent = request.agent(app)
            expect((await agent.post('/api/auth/login').send({ email: user.email, password: '123456' })).status).toBe(200)
            expect((await agent.get('/api/shops/me/orders')).status).toBe(404)
            await shops[0].update({ status: 'suspended' })
            expect((await buyer.get('/api/shops/me/orders')).status).toBe(403)
            await shops[0].update({ status: 'closed' })
            const response = await buyer.get('/api/shops/me/orders')
            expect(response.status).toBe(200)
            expect(response.body.pagination.totalItems).toBe(1)
        } finally {
            await shops[0].update({ status: 'active' })
            await User.destroy({ where: { id: user.id } })
        }
    })
    it('enforces required order links at database level without losing foreign keys', async () => {
        const q = sequelize.getQueryInterface()
        const columns = await q.describeTable('orders')
        const references = await q.getForeignKeyReferencesForTable('orders')
        const order = await Order.findOne({ where: { user_id: users[0].id } })
        for (const field of ['checkout_id', 'user_id', 'payment_method_id']) {
            expect(columns[field].allowNull).toBe(false)
            expect(references.filter(reference => reference.columnName === field)).toHaveLength(1)
            await expect(q.bulkUpdate('orders', { [field]: null }, { id: order.id })).rejects.toThrow()
            await expect(q.bulkUpdate('orders', { [field]: Number.MAX_SAFE_INTEGER }, { id: order.id })).rejects.toThrow()
        }
        expect((await order.reload()).checkout_id).not.toBeNull()
    })
    it('reuses a normalized customer email without overwriting the previous profile', async () => {
        const d = await draft({ first_name: 'New recipient', street: 'Another street' })
        const response = await buyer.post('/api/orders').send(payload(d))
        expect(response.status).toBe(201)
        expect(await Customer.count({ where: { email_key: email } })).toBe(1)
        expect((await Customer.findOne({ where: { email_key: email } })).first_name).toBe('Order')
        expect(response.body.data.orders[0].address.recipient_first_name).toBe('New recipient')
        const oldest = await buyer.get('/api/shops/me/orders').query({ limit: 1, sort: 'oldest' })
        const newest = await buyer.get('/api/shops/me/orders').query({ limit: 1, sort: 'newest' })
        expect(newest.body.pagination).toMatchObject({ totalItems: 2, totalPages: 2 })
        expect(newest.body.data[0].id).toBe(response.body.data.orders[0].id)
        expect(oldest.body.data[0].id).not.toBe(newest.body.data[0].id)
        const secondPage = await buyer.get('/api/shops/me/orders').query({ page: 2, limit: 1, sort: 'newest' })
        expect(secondPage.body.data[0].id).toBe(oldest.body.data[0].id)
    })
    it('rejects changes in product price and shipping quote until explicitly re-saved', async () => {
        const d = await draft()
        await variants[1].update({ price: '51000.25' })
        const response = await buyer.post('/api/orders').send(payload(d))
        expect(response.status).toBe(409)
        expect(response.body.code).toBe('ORDER_REQUOTE_REQUIRED')
        expect(response.body.quote.total.amount_due).toBe(352000.7)
        expect(await Order.count({ where: { checkout_id: (await CheckoutToken.findOne({ where: { checkout_token: d.token } })).id } })).toBe(0)
        await variants[1].update({ price: '50000.25' })
        await rates[0].update({ fixed_fee: 31000 })
        expect((await buyer.post('/api/orders').send(payload(d))).body.code).toBe('ORDER_REQUOTE_REQUIRED')
        const saved = await buyer.patch(`/api/checkout/${d.token}`).send({ version: d.version, shipping_address: d.shipping_address })
        expect((await buyer.post('/api/orders').send(payload(saved.body.data))).status).toBe(201)
        await rates[0].update({ fixed_fee: 30000 })
    })
    it('rolls back everything when one shop is out of stock or COD is disabled', async () => {
        const d = await draft()
        const stockBefore = (await variants[0].reload()).stock_quantity
        const countBefore = await Order.count()
        await variants[1].update({ stock_quantity: 1 })
        expect((await buyer.post('/api/orders').send(payload(d))).status).toBe(409)
        expect((await variants[0].reload()).stock_quantity).toBe(stockBefore)
        expect(await Order.count()).toBe(countBefore)
        await variants[1].update({ stock_quantity: 90 })
        await payments[1].update({ is_active: false })
        expect((await buyer.post('/api/orders').send(payload(d))).body.code).toBe('PAYMENT_METHOD_UNAVAILABLE')
        expect(await Order.count()).toBe(countBefore)
        await payments[1].update({ is_active: true })
        expect((await CheckoutToken.findOne({ where: { checkout_token: d.token } })).is_completed).toBe(false)
    })
    it('rolls back writes when a late delivery validation fails', async () => {
        const d = await draft()
        // Save the changed quote first so the second shop fails after the first shop has been inserted.
        await rates[1].update({ min_delivery_days: 4, max_delivery_days: 3 })
        const saved = await buyer.patch(`/api/checkout/${d.token}`).send({ version: d.version, shipping_address: d.shipping_address })
        const countBefore = await Order.count()
        const stockBefore = (await variants[0].reload()).stock_quantity
        expect((await buyer.post('/api/orders').send(payload(saved.body.data))).body.code).toBe('SHIPPING_METHOD_UNAVAILABLE')
        expect(await Order.count()).toBe(countBefore)
        expect((await variants[0].reload()).stock_quantity).toBe(stockBefore)
        await rates[1].update({ min_delivery_days: 1, max_delivery_days: 3 })
    })
    it('rejects incomplete addresses, foreign checkouts, stale versions and forged totals', async () => {
        const d = await draft({ phone: '' })
        expect((await buyer.post('/api/orders').send(payload(d))).body.code).toBe('INVALID_ORDER_ADDRESS')
        expect((await other.post('/api/orders').send(payload(d))).status).toBe(404)
        expect((await buyer.post('/api/orders').send({ ...payload(d), version: 1 })).body.code).toBe('CHECKOUT_CONFLICT')
        expect((await buyer.post('/api/orders').send({ ...payload(d), total: 1 })).status).toBe(400)
    })
    it('persists a new customer and order address from the simplified checkout without detailed address fields', async () => {
        const d = await draft({ email: simplifiedEmail, city: 'Kinh Môn', street: '', house_number: '', apartment: '', ward: '' })
        const response = await buyer.post('/api/orders').send(payload(d))
        expect(response.status).toBe(201)
        for (const order of response.body.data.orders) {
            const saved = await OrderAddress.findOne({ where: { order_id: order.id } })
            expect(saved.toJSON()).toMatchObject({ city: 'Kinh Môn', street: '', house_number: null, apartment: null, ward: null, postal_code: '03127' })
        }
        expect((await Customer.findOne({ where: { email_key: simplifiedEmail } })).toJSON())
            .toMatchObject({ city: 'Kinh Môn', street: '', house_number: null, apartment: null, ward: null })
        // Existing customer profile data must not be erased by the simplified form.
        expect((await Customer.findOne({ where: { email_key: email } })).street).toBe('Test street')
    })
    it('isolates seller detail/actions and runs the COD lifecycle without decrementing stock again', async () => {
        const created = await buyer.post('/api/orders').send(payload(await draft()))
        expect(created.status).toBe(201)
        const [a, b] = created.body.data.orders
        const path = `/api/shops/me/orders/${a.id}`
        expect((await other.get(path)).status).toBe(404)
        expect((await buyer.get(`/api/shops/me/orders/${b.id}`)).status).toBe(404)
        expect((await request(app).get(path)).status).toBe(401)
        for (const action of ['confirm', 'mark-paid', 'cancel']) {
            expect((await other.post(`${path}/${action}`).send({ version: 1, ...(action === 'cancel' ? { reason: 'Foreign order' } : {}) })).status).toBe(404)
        }
        expect((await other.patch(`${path}/fulfillment`).send({ version: 1, fulfillment_status: 'processing' })).status).toBe(404)
        let detail = (await buyer.get(path)).body.data
        expect(detail).toMatchObject({ order_status: 'pending', financial_status: 'unpaid', fulfillment_status: 'unfulfilled', lock_version: 1 })
        for (const field of ['checkout_id', 'customer_id', 'user_id']) expect(detail).not.toHaveProperty(field)
        expect(detail.items).toHaveLength(1)
        expect(detail.items[0].product_id).toBe(variants[0].product_id)
        expect((await buyer.post(`${path}/mark-paid`).send({ version: 1 })).body.code).toBe('INVALID_ORDER_TRANSITION')
        expect((await buyer.patch(`${path}/fulfillment`).send({ version: 1, fulfillment_status: 'shipped' })).status).toBe(409)
        expect((await buyer.post(`${path}/confirm`).send({ version: 99 })).body.code).toBe('ORDER_CONFLICT')
        const stockBefore = (await variants[0].reload()).stock_quantity
        const concurrent = await Promise.all([1, 2].map(() => buyer.post(`${path}/confirm`).send({ version: 1 })))
        expect(concurrent.map(response => response.status)).toEqual([200, 200])
        detail = concurrent[0].body.data
        expect(detail.events).toHaveLength(1)
        expect(detail.lock_version).toBe(2)
        expect((await buyer.patch(`${path}/fulfillment`).send({ version: 1, fulfillment_status: 'processing' })).body.code).toBe('ORDER_CONFLICT')
        for (const fulfillment of ['processing', 'shipped', 'delivered']) {
            const response = await buyer.patch(`${path}/fulfillment`).send({ version: detail.lock_version, fulfillment_status: fulfillment })
            expect(response.status).toBe(200)
            detail = response.body.data
            expect(detail.fulfillment_status).toBe(fulfillment)
            expect(detail.financial_status).toBe('unpaid')
        }
        expect(detail.allowed_actions).toEqual(['mark-paid'])
        expect((await buyer.post(`${path}/cancel`).send({ version: detail.lock_version, reason: 'Already shipped' })).status).toBe(409)
        const paid = await buyer.post(`${path}/mark-paid`).send({ version: detail.lock_version })
        expect(paid.status).toBe(200)
        detail = paid.body.data
        expect(detail).toMatchObject({ order_status: 'completed', financial_status: 'paid', fulfillment_status: 'delivered', allowed_actions: [] })
        expect(detail.paid_at).toBeTruthy()
        expect(detail.events.map(event => event.action)).toEqual(['confirm', 'processing', 'shipped', 'delivered', 'mark-paid'])
        expect(detail.events.every(event => event.actor_user_id === users[0].id)).toBe(true)
        expect((await buyer.post(`${path}/mark-paid`).send({ version: detail.lock_version - 1 })).body.data.events).toHaveLength(5)
        expect((await variants[0].reload()).stock_quantity).toBe(stockBefore)
        expect((await buyer.get(`/api/orders/${a.id}`)).body.data.status).toBe('completed')
        expect((await other.get(`/api/shops/me/orders/${b.id}`)).body.data.order_status).toBe('pending')
        const filtered = await buyer.get('/api/shops/me/orders').query({ fulfillment_status: 'delivered', financial_status: 'paid', q: a.order_code })
        expect(filtered.body.pagination.totalItems).toBe(1)
    })
    it('cancels once, restores inventory once, and leaves other shop orders and checkout completion intact', async () => {
        const d = await draft()
        const created = await buyer.post('/api/orders').send(payload(d))
        const [a, b] = created.body.data.orders
        const path = `/api/shops/me/orders/${a.id}`
        const stockBefore = Number((await variants[0].reload()).stock_quantity)
        const otherStock = Number((await variants[1].reload()).stock_quantity)
        const product = await Product.findByPk(variants[0].product_id)
        const productVersion = product.lock_version
        expect((await buyer.post(`${path}/cancel`).send({ version: 1, reason: '' })).status).toBe(400)
        await buyer.post(`${path}/confirm`).send({ version: 1 })
        const preparing = await buyer.patch(`${path}/fulfillment`).send({ version: 2, fulfillment_status: 'processing' })
        const responses = await Promise.all([1, 2].map(() => buyer.post(`${path}/cancel`).send({ version: preparing.body.data.lock_version, reason: 'Customer requested cancellation' })))
        expect(responses.map(response => response.status)).toEqual([200, 200])
        expect(responses[0].body.data).toMatchObject({ order_status: 'cancelled', fulfillment_status: 'cancelled', financial_status: 'unpaid', allowed_actions: [] })
        expect(responses[0].body.data.events.filter(event => event.action === 'cancel')).toHaveLength(1)
        expect(Number((await variants[0].reload()).stock_quantity)).toBe(stockBefore + 2)
        expect(Number((await variants[1].reload()).stock_quantity)).toBe(otherStock)
        expect((await product.reload()).stock).toBe(stockBefore + 2)
        expect(product.lock_version).toBe(productVersion + 1)
        expect((await Order.findByPk(b.id)).status).toBe('pending')
        expect((await CheckoutToken.findOne({ where: { checkout_token: d.token } })).is_completed).toBe(true)
        const buyerReceipt = await buyer.get(`/api/checkout/${d.token}/orders`)
        expect(buyerReceipt.body.data.orders[0].status).toBe('cancelled')
    })
    it('rolls back cancellation and stock restoration if history cannot be saved', async () => {
        const created = await buyer.post('/api/orders').send(payload(await draft()))
        const order = created.body.data.orders[0]
        const stock = Number((await variants[0].reload()).stock_quantity)
        const eventModel = require('../src/models').OrderEvent
        const spy = jest.spyOn(eventModel, 'create').mockRejectedValueOnce(new Error('History write failed'))
        try {
            expect((await buyer.post(`/api/shops/me/orders/${order.id}/cancel`).send({ version: 1, reason: 'Rollback test' })).status).toBe(500)
            expect((await Order.findByPk(order.id)).status).toBe('pending')
            expect(Number((await variants[0].reload()).stock_quantity)).toBe(stock)
            expect(await eventModel.count({ where: { order_id: order.id } })).toBe(0)
        } finally { spy.mockRestore() }
    })
    it('preserves historical product/rate links and can restore cancelled stock for a trashed product', async () => {
        const created = await buyer.post('/api/orders').send(payload(await draft()))
        const order = created.body.data.orders[0]
        const productService = require('../src/services/products.service')
        const shippingService = require('../src/services/shipping-settings.service')
        const product = await Product.findByPk(variants[0].product_id)
        const stock = Number((await variants[0].reload()).stock_quantity)
        await expect(productService.updateProduct(users[0].id, product.id, { lock_version: product.lock_version, options: [] }, [], []))
            .rejects.toMatchObject({ statusCode: 409 })
        await expect(shippingService.deleteShippingRate(users[0].id, rates[0].id)).rejects.toMatchObject({ statusCode: 409 })
        await productService.softDeleteProduct(users[0].id, product.id)
        try {
            await expect(productService.permanentlyDeleteProduct(users[0].id, product.id)).rejects.toMatchObject({ statusCode: 409 })
            const cancelled = await buyer.post(`/api/shops/me/orders/${order.id}/cancel`).send({ version: 1, reason: 'Trashed product cancellation' })
            expect(cancelled.status).toBe(200)
            expect(Number((await variants[0].reload()).stock_quantity)).toBe(stock + 2)
            expect(cancelled.body.data.items[0].product_name).toBe(order.items[0].product_name)
        } finally { await productService.restoreProduct(users[0].id, product.id) }
        expect(await Product.findByPk(product.id)).not.toBeNull()
    })
    it('does not oversell when two different checkouts compete for the last items', async () => {
        const a = await draft()
        const b = await draft()
        await variants[0].update({ stock_quantity: 2 })
        const responses = await Promise.all([a, b].map(d => buyer.post('/api/orders').send(payload(d))))
        expect(responses.map(response => response.status).sort()).toEqual([201, 409])
        expect((await variants[0].reload()).stock_quantity).toBe(0)
        await variants[0].update({ stock_quantity: 80 })
    })
})
