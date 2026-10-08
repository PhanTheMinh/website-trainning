const request = require('supertest')
const { v4: uuid } = require('uuid')
const app = require('../src/app')
const sequelize = require('../src/config/database')
const { User, Shop, Category, Product, ProductVariant, Country, ShippingMethod, ShippingRate,
    PaymentMethod, CheckoutToken, Customer, Order, OrderItem, OrderAddress, OrderEvent } = require('../src/models')
const { hashPassword } = require('../src/utils/hash')

const stamp = uuid()
const users = [], shops = [], variants = [], rates = [], agents = [], orders = []
const email = `order-search-${stamp}@example.com`
const defaults = { first_name: 'Search', last_name: 'Customer', email, phone: '+84901234567',
    country_code: 'VN', province_state: 'Hải Dương', city: 'Hanoi', street: 'Test street', house_number: '12', zip_code: '03127' }

async function search(agent, q, options = {}) {
    const response = await agent.get('/api/shops/me/orders').query({ q, ...options })
    expect(response.status).toBe(200)
    return response.body
}

describe('Seller Order List search integration', () => {
    beforeAll(async () => {
        const category = await Category.findOne({ where: { slug: 'giay-chay-bo' } })
        const password = await hashPassword('123456')
        for (let i = 0; i < 2; i++) {
            const user = await User.create({ full_name: `Search seller ${i}`, email: `seller-search-${stamp}-${i}@example.com`,
                password, role: 'user', status: 'active' })
            users.push(user)
            const shop = await Shop.create({ owner_user_id: user.id, name: `Search shop ${i}`, slug: `search-${stamp}-${i}`, status: 'active' })
            shops.push(shop)
            const product = await Product.create({ owner_id: user.id, shop_id: shop.id, title: `Search shoe ${i}`,
                description: 'Order search integration fixture.', category: category.slug, category_id: category.id,
                price: 100000, stock: 100, status: 'active' })
            variants.push(await ProductVariant.create({ product_id: product.id, sku: `SEARCH-${stamp}-${i}`, variant_key: 'default',
                price: 100000, stock_quantity: 100, status: 'active', is_default: true }))
            const country = await Country.create({ shop_id: shop.id, name: 'Vietnam', country_code: 'VN', phone_code: '+84' })
            const method = await ShippingMethod.create({ shop_id: shop.id, name: 'Standard', code: 'standard', status: 'active' })
            const rate = await ShippingRate.create({ shipping_method_id: method.id, min_delivery_days: 1, max_delivery_days: 3, fixed_fee: 30000 })
            rates.push(rate)
            await rate.addCountry(country)
            await PaymentMethod.create({ user_id: user.id, name: 'Cash on delivery', payment_data: { type: 'cod' }, is_active: true, is_deleted: false })
            const agent = request.agent(app)
            agents.push(agent)
            expect((await agent.post('/api/auth/login').send({ email: user.email, password: '123456' })).status).toBe(200)
        }
        // Real multi-shop checkouts create a matching order in each shop.
        for (const [index, address] of [{}, {}, { first_name: 'Literal%_', last_name: 'Name' }].entries()) {
            const checkout = await agents[0].post('/api/checkout').send({ request_id: uuid(), items: variants.map(variant => ({
                product_id: Number(variant.product_id), variant_id: Number(variant.id), quantity: index + 1 })) })
            expect(checkout.status).toBe(201)
            const draft = await agents[0].patch(`/api/checkout/${checkout.body.data.token}`).send({ version: 1,
                shipping_address: { ...defaults, ...address },
                shipping_selections: Object.fromEntries(shops.map((shop, i) => [shop.id, Number(rates[i].id)])),
                payment_method_id: checkout.body.data.payment_options[0].id })
            expect(draft.status).toBe(200)
            const created = await agents[0].post('/api/orders').send({ checkout_token: draft.body.data.token,
                version: draft.body.data.version, request_id: uuid() })
            expect(created.status).toBe(201)
            orders.push(created.body.data.orders)
        }
        await Order.update({ payment_status: 'paid' }, { where: { id: orders[1][0].id } })
        // Every internal code/name contains the target number: numeric search must still return only its ID.
        for (const [index, order] of orders.flat().entries()) {
            order.order_code = `SEARCH-${stamp.slice(0, 8)}-${orders[0][0].id}-${index}`
            order.order_name = `Internal order ${orders[0][0].id}`
            await Order.update({ order_code: order.order_code, order_name: order.order_name }, { where: { id: order.id } })
        }
    }, 30000)

    afterAll(async () => {
        try {
            const rows = await Order.findAll({ where: { user_id: users.map(user => user.id) } })
            const ids = rows.map(order => order.id)
            for (const model of [OrderEvent, OrderItem, OrderAddress]) await model.destroy({ where: { order_id: ids } })
            await Order.destroy({ where: { id: ids } })
            await Customer.destroy({ where: { email_key: email } })
            await CheckoutToken.destroy({ where: { user_id: users.map(user => user.id) } })
            await ShippingRate.destroy({ where: { id: rates.map(rate => rate.id) } })
            await User.destroy({ where: { id: users.map(user => user.id) } })
        } finally { await sequelize.close() }
    })

    it.each(['Search', 'Customer', 'Search Customer', '  Search Customer  '])('finds customer name "%s"', async q => {
        const result = await search(agents[0], q)
        expect(result.pagination.totalItems).toBe(2)
        expect(result.data.map(order => order.id).sort((a, b) => a - b)).toEqual([orders[0][0].id, orders[1][0].id].sort((a, b) => a - b))
        expect(result.data.every(order => order.shop_id === shops[0].id)).toBe(true)
    })

    it('does not search internal order names or codes', async () => {
        for (const q of [orders[0][0].order_name, orders[0][0].order_code]) {
            const result = await search(agents[0], q)
            expect(result.pagination.totalItems).toBe(0)
            expect(result.data).toEqual([])
        }
    })

    it.each(['number', 'hash', 'padded', 'displayed name', 'surrounding spaces'])('finds the displayed order name using %s', async format => {
        const id = orders[0][0].id
        const displayedName = `#${String(id).padStart(4, '0')}`
        const queries = { number: String(id), hash: `#${id}`, padded: String(id).padStart(8, '0'),
            'displayed name': displayedName, 'surrounding spaces': `  ${displayedName}  ` }
        const result = await search(agents[0], queries[format])
        expect(result.pagination).toMatchObject({ totalItems: 1, totalPages: 1 })
        expect(result.data.map(order => order.id)).toEqual([id])
        expect(result.data[0]).toMatchObject({ shop_id: shops[0].id, recipient_name: 'Search Customer' })
        // All fixture order codes contain this number; they must not broaden the results.
        expect(orders.flat().every(order => order.order_code.includes(String(id)))).toBe(true)
    })

    it('does not match a different customer whose name contains the searched order number', async () => {
        const target = orders[0][0]
        const other = orders[2][0]
        const snapshot = await OrderAddress.findOne({ where: { order_id: other.id } })
        const previous = snapshot.recipient_first_name
        try {
            await snapshot.update({ recipient_first_name: `Customer ${target.id}` })
            const result = await search(agents[0], String(target.id))
            expect(result.pagination.totalItems).toBe(1)
            expect(result.data.map(order => order.id)).toEqual([target.id])
        } finally { await snapshot.update({ recipient_first_name: previous }) }
    })

    it('returns no orders when the displayed name does not exist', async () => {
        for (const q of ['#0000', '#9007199254740991', '9007199254740992']) {
            const result = await search(agents[0], q)
            expect(result.pagination.totalItems).toBe(0)
            expect(result.data).toEqual([])
        }
    })

    it('keeps financial filters and pagination when searching the displayed order name', async () => {
        const name = `#${String(orders[1][0].id).padStart(4, '0')}`
        const paid = await search(agents[0], name, { financial_status: 'paid', limit: 1 })
        expect(paid.data.map(order => order.id)).toEqual([orders[1][0].id])
        expect(paid.pagination).toMatchObject({ totalItems: 1, totalPages: 1, page: 1 })
        const unpaid = await search(agents[0], name, { financial_status: 'unpaid' })
        expect(unpaid.data).toEqual([])
        expect(unpaid.pagination.totalItems).toBe(0)
        const nextPage = await search(agents[0], name, { financial_status: 'paid', limit: 1, page: 2 })
        expect(nextPage.data).toEqual([])
        expect(nextPage.pagination).toMatchObject({ totalItems: 1, totalPages: 1, page: 2 })
    })

    it('rejects a displayed order name belonging to another shop', async () => {
        const foreign = orders[0][1]
        const name = `#${String(foreign.id).padStart(4, '0')}`
        const hidden = await search(agents[0], name)
        expect(hidden.data).toEqual([])
        expect(hidden.pagination.totalItems).toBe(0)
        const owned = await search(agents[1], name)
        expect(owned.data.map(order => order.id)).toEqual([foreign.id])
        expect(owned.data[0].shop_id).toBe(shops[1].id)
    })

    it.each(['%', '_', 'Literal%_ Name'])('treats "%s" literally instead of as SQL wildcards', async q => {
        const result = await search(agents[0], q)
        expect(result.pagination.totalItems).toBe(1)
        expect(result.data.map(order => order.id)).toEqual([orders[2][0].id])
    })

    it('returns an empty result for unknown names and SQL-like input', async () => {
        for (const q of ['No such customer', "' OR 1=1 --"]) {
            const result = await search(agents[0], q)
            expect(result.data).toEqual([])
            expect(result.pagination.totalItems).toBe(0)
        }
    })

    it('does not return another shop order by name, code or order number', async () => {
        const foreign = orders[0][1]
        for (const q of [foreign.order_name, foreign.order_code, `#${foreign.id}`]) {
            const result = await search(agents[0], q)
            expect(result.data).toEqual([])
            expect(result.pagination.totalItems).toBe(0)
        }
        const secondShop = await search(agents[1], 'Search Customer')
        expect(secondShop.pagination.totalItems).toBe(2)
        expect(secondShop.data.every(order => order.shop_id === shops[1].id)).toBe(true)
    })

    it('combines search with financial filtering and total sorting before pagination', async () => {
        const paid = await search(agents[0], 'Search Customer', { financial_status: 'paid' })
        expect(paid.data.map(order => order.id)).toEqual([orders[1][0].id])
        const first = await search(agents[0], 'Search Customer', { sort: 'total_desc', limit: 1, page: 1 })
        const second = await search(agents[0], 'Search Customer', { sort: 'total_desc', limit: 1, page: 2 })
        expect(first.pagination).toMatchObject({ totalItems: 2, totalPages: 2, page: 1 })
        expect(first.data.map(order => order.id)).toEqual([orders[1][0].id])
        expect(second.data.map(order => order.id)).toEqual([orders[0][0].id])
    })

    it('requires authentication and rejects an oversized search', async () => {
        expect((await request(app).get('/api/shops/me/orders').query({ q: 'Search' })).status).toBe(401)
        expect((await agents[0].get('/api/shops/me/orders').query({ q: 'x'.repeat(101) })).status).toBe(400)
    })
})
