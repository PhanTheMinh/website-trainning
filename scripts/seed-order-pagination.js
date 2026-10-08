const { v4: uuid } = require('uuid')
const sequelize = require('../src/config/database')
const { Shop, Order, OrderItem, OrderAddress, Customer, CheckoutToken } = require('../src/models')
const { cents, money, deliveryDate } = require('../src/services/orders.service')
const { listOrders } = require('../src/services/seller-orders.service')

const names = ['Minh Anh', 'Thanh Long', 'Thu Trang', 'Hoang Nam', 'Mai Linh', 'Duc Huy', 'Ngoc Anh',
    'Quang Minh', 'Bao Tram', 'Gia Huy', 'Khanh Linh', 'Tuan Anh', 'Phuong Thao', 'Hai Dang', 'Nhat Minh',
    'Yen Nhi', 'Bao Ngoc', 'Thanh Son', 'Anh Thu', 'Trung Kien', 'Hong Nhung', 'Van An', 'My Duyen', 'Duy Khang', 'Thuy Tien']
function copy(row) {
    const value = row.toJSON()
    for (const key of ['id', 'created_at', 'updated_at']) delete value[key]
    return value
}

async function seed() {
    if (process.env.NODE_ENV === 'production') throw new Error('Pagination fixtures are for local development only.')
    const shopId = Number(process.argv[2])
    if (!Number.isSafeInteger(shopId) || shopId < 1) throw new Error('Usage: node scripts/seed-order-pagination.js <shop-id>')
    const result = await sequelize.transaction(async transaction => {
        const shop = await Shop.findByPk(shopId, { transaction })
        if (!shop) throw new Error('Shop not found.')
        const template = await Order.findOne({ where: { shop_id: shopId }, order: [['id', 'ASC']], transaction })
        if (!template) throw new Error('Create one real order for this shop before seeding pagination fixtures.')
        const sourceAddress = await OrderAddress.findOne({ where: { order_id: template.id }, transaction })
        const sourceCustomer = await Customer.findByPk(template.customer_id, { transaction })
        const sourceCheckout = await CheckoutToken.findByPk(template.checkout_id, { transaction })
        const sourceItems = await OrderItem.findAll({ where: { order_id: template.id }, transaction })
        if (!sourceAddress || !sourceCustomer || !sourceCheckout || !sourceItems.length) throw new Error('The source order is incomplete.')
        let created = 0
        for (const [index, name] of names.entries()) {
            const code = `PAGINATION-${shopId}-${String(index + 1).padStart(2, '0')}`
            if (await Order.findOne({ where: { order_code: code }, transaction })) continue
            const [first, last] = name.split(' ')
            const email = `pagination-${shopId}-${index + 1}@example.invalid`
            const phone = `090000${String(index + 1).padStart(4, '0')}`
            const customer = await Customer.create({ ...copy(sourceCustomer), first_name: first, last_name: last,
                email, email_key: email, phone, street: 'Demo Street', house_number: String(index + 1), apartment: null }, { transaction })
            const address = { ...copy(sourceAddress), recipient_first_name: first, recipient_last_name: last,
                email, phone, street: 'Demo Street', house_number: String(index + 1), apartment: null }
            delete address.order_id
            const quantity = index % 3 + 1
            const lines = sourceItems.map(item => ({ ...copy(item), quantity, line_total: money(cents(item.unit_price) * quantity) }))
            const subtotal = lines.reduce((sum, item) => sum + cents(item.line_total), 0)
            const total = money(subtotal + cents(template.shipping_fee))
            const createdAt = new Date(Date.now() - (index + 1) * 86400000)
            const paid = index % 2 === 0
            const checkout = await CheckoutToken.create({ ...copy(sourceCheckout), checkout_token: uuid(), request_id: uuid(),
                order_request_id: uuid(), is_completed: true, shop_used_id: shopId,
                items: lines.map(item => ({ product_id: item.product_id, variant_id: item.product_variant_id, quantity,
                    shop_id: shopId, name: item.product_name, price: item.unit_price, image_url: item.image_url })),
                shipping_address: JSON.stringify({ first_name: first, last_name: last, email, phone,
                    country_code: address.country_code, country_name: address.country_name, province_state: address.province_name,
                    city: address.city, street: address.street, house_number: address.house_number, zip_code: address.postal_code }),
                total: JSON.stringify({ subtotal: money(subtotal), shipping_fee: template.shipping_fee, amount_due: total }),
                created_at: createdAt, updated_at: createdAt }, { transaction })
            const order = await Order.create({ ...copy(template), checkout_id: checkout.id, customer_id: customer.id,
                order_code: code, order_name: `Order ${code}`, sub_total: money(subtotal), order_total: total,
                status: paid ? 'completed' : 'confirmed', payment_status: paid ? 'paid' : 'unpaid',
                fulfillment_status: paid ? 'delivered' : 'shipped', lock_version: 1,
                confirmed_at: createdAt, shipped_at: createdAt, delivered_at: paid ? createdAt : null,
                paid_at: paid ? createdAt : null, cancelled_at: null, cancellation_reason: null,
                estimated_delivery_from: deliveryDate(template.min_delivery_days, createdAt),
                estimated_delivery_to: deliveryDate(template.max_delivery_days, createdAt),
                created_at: createdAt, updated_at: createdAt }, { transaction })
            await OrderAddress.create({ ...address, order_id: order.id }, { transaction })
            await OrderItem.bulkCreate(lines.map(item => ({ ...item, order_id: order.id })), { transaction })
            created++
        }
        return { ownerId: shop.owner_user_id, shop: shop.name, created, totalOrders: await Order.count({ where: { shop_id: shopId }, transaction }) }
    })
    const { ownerId, ...summary } = result
    const pageSizes = []
    const seen = new Set()
    for (let page = 1; page <= Math.ceil(summary.totalOrders / 10); page++) {
        const response = await listOrders(ownerId, { q: '', order_status: 'all', financial_status: 'all',
            fulfillment_status: 'all', sort: 'newest', limit: 10, page })
        for (const order of response.items) {
            if (Number(order.shop_id) !== shopId || seen.has(order.id)) throw new Error('Pagination returned an incorrect or duplicate order.')
            seen.add(order.id)
        }
        pageSizes.push(response.items.length)
    }
    if (seen.size !== summary.totalOrders) throw new Error('Pagination did not return all orders.')
    console.log(JSON.stringify({ ...summary, pageSizes }))
}

seed().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => sequelize.close())
