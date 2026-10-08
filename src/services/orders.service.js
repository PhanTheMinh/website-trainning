const { Transaction } = require('sequelize')
const { v4: uuid } = require('uuid')
const sequelize = require('../config/database')
const { CheckoutToken, Shop, Product, ProductVariant, ProductOption,
    ShippingRate, ShippingMethod, ShippingRateCountry, Country, PaymentMethod,
    GeoCountry, Province, Customer, Order, OrderItem, OrderAddress } = require('../models')
const { validatePurchaseItems } = require('./products.service')
const { calculate, resolvePayment } = require('./checkout.service')
const { finalAddressSchema } = require('../validators/orders.validator')

const fail = (message, statusCode, publicCode) => Object.assign(new Error(message), { statusCode, publicCode })
const parse = (value, fallback = {}) => {
    if (value && typeof value === 'object') return value
    try { return JSON.parse(value) || fallback } catch { return fallback }
}
function cents(value) {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value))
    const amount = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN
    if (!Number.isSafeInteger(amount)) throw fail('Invalid monetary amount', 409, 'INVALID_PRICE')
    return amount
}
function money(amount) {
    if (!Number.isSafeInteger(amount) || amount < 0) throw fail('Order total is too large', 400, 'INVALID_TOTAL')
    return `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`
}
function deliveryDate(days, now = new Date()) {
    // Calendar days from the order date in Asia/Ho_Chi_Minh, not business days.
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh',
        year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    const part = name => parts.find(p => p.type === name).value
    const date = new Date(`${part('year')}-${part('month')}-${part('day')}T00:00:00Z`)
    date.setUTCDate(date.getUTCDate() + days)
    return date.toISOString().slice(0, 10)
}
function quoteChanged(draft, current) {
    const previous = parse(draft.items, [])
    const oldTotal = parse(draft.total)
    const rates = parse(draft.shipping_method).quoted_rates
    return previous.length !== current.items.length || current.items.some(item => {
        const old = previous.find(entry => Number(entry.variant_id) === Number(item.variant_id))
        return !old || Number(old.shop_id) !== Number(item.shop_id) ||
            old.quantity !== item.quantity || cents(old.price ?? old.unit_price) !== cents(item.price)
    }) || ['subtotal', 'shipping_fee', 'amount_due'].some(key => oldTotal[key] == null ||
        cents(oldTotal[key]) !== cents(current.total[key])) || (rates && current.shipping.some(group => {
        const old = rates.find(rate => Number(rate.shop_id) === group.shop_id)
        return !old || old.rate_id !== group.selected.rate_id || cents(old.fixed_fee) !== cents(group.selected.fixed_fee) ||
            old.min_delivery_days !== group.selected.min_delivery_days || old.max_delivery_days !== group.selected.max_delivery_days
    }))
}
async function addressData(draft, transaction) {
    const { value, error } = finalAddressSchema.validate(parse(draft.shipping_address))
    if (error) throw fail(error.details.map(detail => detail.message).join('; '), 400, 'INVALID_ORDER_ADDRESS')
    const country = await GeoCountry.findOne({ where: { code: value.country_code }, transaction })
    if (!country) throw fail('Choose a supported country', 400, 'INVALID_ORDER_ADDRESS')
    const province = value.province_state ? await Province.findOne({
        where: { country_id: country.id, name: value.province_state }, transaction }) : null
    const regionCount = await Province.count({ where: { country_id: country.id }, transaction })
    if (regionCount && !province) throw fail('Choose a province/state belonging to the selected country', 400, 'INVALID_ORDER_ADDRESS')
    const fields = { country_id: country.id, province_id: province?.id || null,
        city: value.city, ward: value.ward || null, street: value.street,
        house_number: value.house_number || null, apartment: value.apartment || null, postal_code: value.zip_code || null }
    return { customer: { ...fields, email: value.email, email_key: value.email,
        first_name: value.first_name, last_name: value.last_name, phone: value.phone },
    snapshot: { ...fields, recipient_first_name: value.first_name, recipient_last_name: value.last_name,
        email: value.email, phone: value.phone, country_code: country.code, country_name: country.name,
        province_code: province?.code || null, province_name: province?.name || null } }
}
async function lockConfiguration(shopIds, selections, transaction) {
    const lock = transaction.LOCK.UPDATE
    const shops = await Shop.findAll({ where: { id: shopIds }, order: [['id', 'ASC']], transaction, lock })
    const ownerIds = [...new Set(shops.map(shop => Number(shop.owner_user_id)))].sort((a, b) => a - b)
    await PaymentMethod.findAll({ where: { user_id: ownerIds }, order: [['id', 'ASC']], transaction, lock })
    const rateIds = [...new Set(shopIds.map(id => Number(selections[id])))].sort((a, b) => a - b)
    if (rateIds.some(id => !Number.isSafeInteger(id) || id < 1)) throw fail('Choose shipping for every shop', 400, 'SHIPPING_METHOD_REQUIRED')
    const rates = await ShippingRate.findAll({ where: { id: rateIds }, order: [['id', 'ASC']], transaction, lock })
    await ShippingMethod.findAll({ where: { id: rates.map(rate => rate.shipping_method_id) }, order: [['id', 'ASC']], transaction, lock })
    const links = await ShippingRateCountry.findAll({ where: { shipping_rate_id: rateIds },
        order: [['shipping_rate_id', 'ASC'], ['country_id', 'ASC']], transaction, lock })
    await Country.findAll({ where: { id: [...new Set(links.map(link => link.country_id))] }, order: [['id', 'ASC']], transaction, lock })
    return shops
}
function includes() {
    return [{ model: OrderItem, as: 'items' }, { model: OrderAddress, as: 'address' },
        { model: Shop, as: 'shop', attributes: ['id', 'name'] }]
}
async function getCheckoutOrders(userId, token, transaction) {
    const checkout = await CheckoutToken.findOne({ where: { checkout_token: token, user_id: userId }, transaction })
    if (!checkout) throw fail('Checkout not found', 404, 'CHECKOUT_NOT_FOUND')
    const rows = await Order.findAll({ where: { checkout_id: checkout.id, user_id: userId }, transaction,
        order: [['id', 'ASC']], include: includes() })
    const orders = rows.map(row => row.toJSON())
    orders.forEach(order => order.items.sort((a, b) => Number(a.id) - Number(b.id)))
    return { checkout_token: token, currency: 'VND', orders }
}
async function getOrder(userId, id) {
    const order = await Order.findOne({ where: { id, user_id: userId }, include: includes() })
    if (!order) throw fail('Order not found', 404, 'ORDER_NOT_FOUND')
    return order.toJSON()
}
async function createInTransaction(userId, data, transaction) {
    const lock = transaction.LOCK.UPDATE
    const draft = await CheckoutToken.findOne({ where: { user_id: userId, checkout_token: data.checkout_token }, transaction, lock })
    if (!draft) throw fail('Checkout not found', 404, 'CHECKOUT_NOT_FOUND')
    const byRequest = await CheckoutToken.findOne({ where: { user_id: userId, order_request_id: data.request_id }, transaction })
    if (byRequest && Number(byRequest.id) !== Number(draft.id)) throw fail('Request ID was used for another checkout', 409, 'IDEMPOTENCY_CONFLICT')
    const existing = await Order.findOne({ where: { checkout_id: draft.id, user_id: userId }, transaction })
    if (existing) return getCheckoutOrders(userId, data.checkout_token, transaction)
    if (draft.is_completed) throw fail('Checkout is already completed', 409, 'CHECKOUT_COMPLETED')
    if (draft.version !== data.version) throw fail('Checkout changed. Reload before placing your order.', 409, 'CHECKOUT_CONFLICT')
    const address = await addressData(draft, transaction)
    const savedItems = parse(draft.items, [])
    if (!savedItems.length || savedItems.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000)) {
        throw fail('Checkout has invalid or missing items', 400, 'INVALID_ORDER_ITEMS')
    }
    const validated = await validatePurchaseItems(savedItems, transaction)
    const shopIds = [...new Set(validated.map(item => item.shop_id))].sort((a, b) => a - b)
    const selections = parse(draft.shipping_method).selected_rates || {}
    await lockConfiguration(shopIds, selections, transaction)
    const current = await calculate(savedItems, parse(draft.shipping_address), selections, transaction, true)
    if (current.issues.length) throw fail(current.issues.join(' '), 409, 'SHIPPING_METHOD_UNAVAILABLE')
    const savedPayment = parse(draft.payment_method, null)
    if (!savedPayment?.id) throw fail('Choose a payment method', 400, 'PAYMENT_METHOD_REQUIRED')
    const payment = await resolvePayment(shopIds, savedPayment.id, transaction, true)
    if (JSON.stringify(savedPayment.method_ids) !== JSON.stringify(payment.selected.method_ids)) {
        throw fail('Payment configuration changed. Choose an available method again.', 409, 'PAYMENT_METHOD_UNAVAILABLE')
    }
    if (quoteChanged(draft, current)) {
        const error = fail('Prices or shipping changed. Review the latest quote and confirm again.', 409, 'ORDER_REQUOTE_REQUIRED')
        error.publicData = { quote: current }
        throw error
    }
    // Unique normalized email handles first-time customers created by concurrent checkouts.
    const [customer] = await Customer.findOrCreate({ where: { email_key: address.customer.email_key },
        defaults: address.customer, transaction })
    await draft.update({ order_request_id: data.request_id }, { transaction })
    const now = new Date()
    for (const shopId of shopIds) {
        const lines = current.items.filter(item => item.shop_id === shopId)
        const selected = current.shipping.find(entry => entry.shop_id === shopId).selected
        const method = await ShippingMethod.findByPk(selected.method_id, { transaction })
        const rate = await ShippingRate.findByPk(selected.rate_id, { transaction })
        const minDays = Number(rate.min_delivery_days)
        const maxDays = Number(rate.max_delivery_days)
        if (!Number.isInteger(minDays) || minDays < 0 || !Number.isInteger(maxDays) || maxDays < minDays || maxDays > 3650) {
            throw fail('Invalid shipping delivery estimate', 409, 'SHIPPING_METHOD_UNAVAILABLE')
        }
        const subTotal = lines.reduce((sum, line) => sum + cents(line.price) * line.quantity, 0)
        const shippingFee = cents(rate.fixed_fee)
        const total = money(subTotal + shippingFee)
        const code = `ORD-${uuid()}`
        const paymentMethod = await PaymentMethod.findByPk(payment.selected.method_ids[shopId], { transaction })
        const order = await Order.create({ checkout_id: draft.id, user_id: userId, customer_id: customer.id, shop_id: shopId,
            order_code: code, order_name: `Order ${code}`, status: 'pending', currency: 'VND',
            sub_total: money(subTotal), shipping_fee: money(shippingFee), order_total: total,
            shipping_method_id: method.id, shipping_rate_id: rate.id, shipping_method_name: method.name,
            shipping_method_code: method.code, min_delivery_days: minDays, max_delivery_days: maxDays,
            estimated_delivery_from: deliveryDate(minDays, now), estimated_delivery_to: deliveryDate(maxDays, now),
            payment_method_id: paymentMethod.id, payment_method_data: { id: Number(paymentMethod.id), type: 'cod',
                name: paymentMethod.name, description: paymentMethod.payment_data.description || null,
                instructions: paymentMethod.payment_data.instructions || null }, payment_status: 'unpaid' }, { transaction })
        await OrderAddress.create({ order_id: order.id, ...address.snapshot }, { transaction })
        for (const line of lines) {
            const variant = await ProductVariant.findByPk(line.variant_id, { transaction })
            const options = await variant.getOptionValues({ transaction, include: [{ model: ProductOption, as: 'option' }] })
            await OrderItem.create({ order_id: order.id, product_id: line.product_id, product_variant_id: line.variant_id,
                product_name: line.name, sku: variant.sku, variant_data: options.map(option => ({
                    name: option.option.name, value: option.value })), image_url: line.image_url,
                quantity: line.quantity, unit_price: money(cents(variant.price)), line_total: money(cents(variant.price) * line.quantity) }, { transaction })
            await variant.update({ stock_quantity: Number(variant.stock_quantity) - line.quantity }, { transaction })
        }
    }
    for (const productId of [...new Set(validated.map(item => item.product_id))]) {
        const stock = await ProductVariant.sum('stock_quantity', { where: { product_id: productId }, transaction })
        await Product.update({ stock: stock || 0 }, { where: { id: productId }, transaction })
        // Invalidate product editor forms opened before this inventory change.
        await Product.increment('lock_version', { by: 1, where: { id: productId }, transaction })
    }
    await draft.update({ is_completed: true, version: draft.version + 1 }, { transaction })
    return getCheckoutOrders(userId, data.checkout_token, transaction)
}
async function createOrder(userId, data) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.READ_COMMITTED },
                transaction => createInTransaction(userId, data, transaction))
        } catch (error) {
            const retryable = error.original?.code === 'ER_LOCK_DEADLOCK' || error.name === 'SequelizeUniqueConstraintError'
            if (!retryable || attempt === 2) throw error
        }
    }
}

module.exports = { createOrder, getOrder, getCheckoutOrders, cents, money, deliveryDate, quoteChanged }
