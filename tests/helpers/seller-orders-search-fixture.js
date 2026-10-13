const request = require('supertest')
const { v4: uuid } = require('uuid')
const app = require('../../src/app')
const sequelize = require('../../src/config/database')
const { User, Shop, Category, Product, ProductVariant, Country, ShippingMethod, ShippingRate,
    PaymentMethod, CheckoutToken, Customer, Order, OrderItem, OrderAddress, OrderEvent } = require('../../src/models')
const { hashPassword } = require('../../src/utils/hash')

const stamp = uuid()
const users = [], shops = [], variants = [], rates = [], agents = [], orders = []
const email = `order-search-${stamp}@example.com`
const defaults = { first_name: 'Search', last_name: 'Customer', email, phone: '+84901234567',
    country_code: 'VN', province_state: 'Hải Dương', city: 'Hanoi', street: 'Test street', house_number: '12', zip_code: '03127' }


async function seed() {
        // Chỉ tạo fixture trong môi trường test; không dùng dữ liệu ứng dụng thật.
        if (process.env.NODE_ENV !== 'test') throw new Error('Order search fixtures require NODE_ENV=test')
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
        // Tạo checkout thật qua API; mỗi checkout có một Order cho mỗi shop.
        for (const [index, address] of [{}, {}, { first_name: 'Literal%_', last_name: 'Name' }].entries()) {
            const checkout = await agents[0].post('/api/checkout').send({ request_id: uuid(), items: variants.map(variant => ({
                product_id: Number(variant.product_id), variant_id: Number(variant.id), quantity: index + 1 })) })
            expect(checkout.status).toBe(201)
            const draft = await agents[0].patch(`/api/checkout/${checkout.body.data.token}`).send({ version: 1,
                shipping_address: { ...defaults, ...address, email: `search-${stamp}-${index}@example.com` },
                shipping_selections: Object.fromEntries(shops.map((shop, i) => [shop.id, Number(rates[i].id)])),
                payment_method_id: checkout.body.data.payment_options[0].id })
            expect(draft.status).toBe(200)
            const created = await agents[0].post('/api/orders').send({ checkout_token: draft.body.data.token,
                version: draft.body.data.version, request_id: uuid() })
            expect(created.status).toBe(201)
            orders.push(created.body.data.orders)
        }
        await Order.update({ payment_status: 'paid' }, { where: { id: orders[1][0].id } })
        // Giữ tên do API tự sinh theo chủ shop; chỉ đổi order_code để kiểm tra phạm vi search.
        for (const [index, order] of orders.flat().entries()) {
            order.order_code = `SEARCH-${stamp.slice(0, 8)}-${orders[0][0].id}-${index}`
            await Order.update({ order_code: order.order_code }, { where: { id: order.id } })
        }

}
async function cleanup() {
        // Xóa bản ghi con trước Order rồi xóa khách checkout và tài khoản test.
        try {
            const rows = await Order.findAll({ where: { user_id: users.map(user => user.id) } })
            const ids = rows.map(order => order.id)
            for (const model of [OrderEvent, OrderItem, OrderAddress]) await model.destroy({ where: { order_id: ids } })
            await Order.destroy({ where: { id: ids } })
            await Customer.destroy({ where: { email_key: [0, 1, 2].map(index => `search-${stamp}-${index}@example.com`) } })
            await CheckoutToken.destroy({ where: { user_id: users.map(user => user.id) } })
            await ShippingRate.destroy({ where: { id: rates.map(rate => rate.id) } })
            await User.destroy({ where: { id: users.map(user => user.id) } })
        } finally { await sequelize.close() }

}
module.exports = { seed, cleanup, app, sequelize, users, shops, agents, orders, Customer, Order, OrderAddress, variants, rates }


