const { Op, fn, col, where: sqlWhere } = require('sequelize')
const sequelize = require('../config/database')
const { Shop, Order, OrderItem, OrderAddress, OrderEvent, Product, ProductVariant } = require('../models')

const fail = (message, statusCode, publicCode) => Object.assign(new Error(message), { statusCode, publicCode })

async function managedShop(userId, transaction) {
    // Resolve ownership from the session, never from a client-supplied shop ID.
    const shop = await Shop.findOne({ where: { owner_user_id: userId }, attributes: ['id', 'status'], transaction })
    if (!shop) throw fail('Shop not found', 404, 'SHOP_NOT_FOUND')
    if (shop.status === 'suspended') throw fail('Suspended shop cannot manage orders', 403, 'SHOP_SUSPENDED')
    return shop
}

async function listOrders(userId, options) {
    const shop = await managedShop(userId)

    const where = { shop_id: shop.id }
    if (options.order_status !== 'all') where.status = options.order_status
    if (options.financial_status !== 'all') where.payment_status = options.financial_status
    if (options.fulfillment_status !== 'all') where.fulfillment_status = options.fulfillment_status
    if (options.q) {
        const orderId = options.q.match(/^#?(\d+)$/)
        if (orderId) {
            const id = Number(orderId[1])
            where.id = Number.isSafeInteger(id) && id > 0 ? id : 0
        } else {
            const search = { [Op.like]: `%${options.q.replace(/[\\%_]/g, '\\$&')}%` }
            where[Op.or] = [
                { '$address.recipient_first_name$': search },
                { '$address.recipient_last_name$': search },
                sqlWhere(fn('CONCAT_WS', ' ', col('address.recipient_first_name'), col('address.recipient_last_name')), search)
            ]
        }
    }
    const direction = options.sort === 'oldest' ? 'ASC' : 'DESC'
    const orderBy = options.sort === 'total_desc' || options.sort === 'total_asc'
        ? [['order_total', options.sort === 'total_desc' ? 'DESC' : 'ASC'], ['id', 'DESC']]
        : [['created_at', direction], ['id', direction]]
    const result = await Order.findAndCountAll({
        where,
        attributes: ['id', 'order_code', 'shop_id', 'status', 'payment_status', 'currency',
            'sub_total', 'shipping_fee', 'order_total', 'created_at', 'fulfillment_status'],
        include: [
            { model: OrderAddress, as: 'address', attributes: ['recipient_first_name', 'recipient_last_name'] },
            // Fetch quantities after pagination; joining all items would duplicate order rows/counts.
            { model: OrderItem, as: 'items', attributes: ['quantity'], separate: true }
        ],
        order: orderBy,
        limit: options.limit,
        offset: (options.page - 1) * options.limit,
        subQuery: false
    })
    return {
        items: result.rows.map(row => {
            const order = row.toJSON()
            return {
                id: order.id,
                order_code: order.order_code,
                shop_id: order.shop_id,
                created_at: order.created_at,
                recipient_name: [order.address?.recipient_first_name, order.address?.recipient_last_name].filter(Boolean).join(' '),
                item_quantity: order.items.reduce((sum, item) => sum + Number(item.quantity), 0),
                currency: order.currency,
                sub_total: order.sub_total,
                shipping_fee: order.shipping_fee,
                order_total: order.order_total,
                order_status: order.status,
                financial_status: order.payment_status,
                fulfillment_status: order.fulfillment_status
            }
        }),
        pagination: {
            page: options.page,
            limit: options.limit,
            totalItems: result.count,
            totalPages: Math.max(1, Math.ceil(result.count / options.limit))
        }
    }
}

function state(order) {
    return { order_status: order.status, financial_status: order.payment_status, fulfillment_status: order.fulfillment_status }
}
function actions(order) {
    if (['cancelled', 'completed'].includes(order.status)) return []
    const result = []
    if (order.status === 'pending') result.push('confirm')
    if (order.status === 'confirmed') {
        const next = { unfulfilled: 'processing', processing: 'shipped', shipped: 'delivered' }[order.fulfillment_status]
        if (next) result.push(next)
        if (order.fulfillment_status === 'delivered' && order.payment_status === 'unpaid' && order.payment_method_data?.type === 'cod') result.push('mark-paid')
    }
    if (order.payment_status === 'unpaid' && ['unfulfilled', 'processing'].includes(order.fulfillment_status)) result.push('cancel')
    return result
}
async function ownedOrder(shopId, id, transaction, lock = false) {
    const order = await Order.findOne({ where: { id, shop_id: shopId }, transaction,
        ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) })
    if (!order) throw fail('Order not found', 404, 'ORDER_NOT_FOUND')
    return order
}
async function detail(shopId, id, transaction) {
    const order = await Order.findOne({ where: { id, shop_id: shopId }, transaction, include: [
        { model: OrderItem, as: 'items', separate: true, order: [['id', 'ASC']] },
        { model: OrderAddress, as: 'address' },
        { model: OrderEvent, as: 'events', separate: true, order: [['id', 'ASC']],
            include: [{ association: 'actor', attributes: ['full_name'] }] }
    ] })
    if (!order) throw fail('Order not found', 404, 'ORDER_NOT_FOUND')
    const value = order.toJSON()
    // The seller must not receive the shared checkout or unrelated buyer account/profile.
    delete value.checkout_id
    delete value.user_id
    delete value.customer_id
    return { ...value, ...state(order), allowed_actions: actions(order) }
}
async function getOrder(userId, id) {
    const shop = await managedShop(userId)
    return detail(shop.id, id)
}
async function restoreStock(order, transaction) {
    const items = await OrderItem.findAll({ where: { order_id: order.id }, order: [['product_id', 'ASC'], ['product_variant_id', 'ASC']], transaction })
    for (const productId of [...new Set(items.map(item => item.product_id))]) {
        // Match product-before-variant locking used by checkout and product editing.
        const product = await Product.findOne({ where: { id: productId, shop_id: order.shop_id }, paranoid: false,
            transaction, lock: transaction.LOCK.UPDATE })
        if (!product) throw fail('Order inventory links are invalid', 409, 'ORDER_INVENTORY_CONFLICT')
        for (const item of items.filter(line => line.product_id === productId)) {
            const variant = await ProductVariant.findOne({ where: { id: item.product_variant_id, product_id: productId },
                transaction, lock: transaction.LOCK.UPDATE })
            if (!variant) throw fail('Order variant is missing', 409, 'ORDER_INVENTORY_CONFLICT')
            await variant.increment('stock_quantity', { by: item.quantity, transaction })
        }
        const stock = await ProductVariant.sum('stock_quantity', { where: { product_id: productId }, transaction })
        await product.update({ stock: stock || 0, lock_version: product.lock_version + 1 }, { transaction })
    }
}
async function changeOrder(userId, id, action, data) {
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await sequelize.transaction(async transaction => {
                const shop = await managedShop(userId, transaction)
                const order = await ownedOrder(shop.id, id, transaction, true)
                // Repeating a completed action is harmless, including retries after a lost response.
                const repeated = action === 'confirm' ? order.confirmed_at : action === 'mark-paid' ? order.paid_at
                    : action === 'cancel' ? order.status === 'cancelled'
                        : action === 'processing' ? ['processing', 'shipped', 'delivered'].includes(order.fulfillment_status)
                            : action === 'shipped' ? order.shipped_at : action === 'delivered' ? order.delivered_at : false
                if (repeated) return detail(shop.id, id, transaction)
                if (order.lock_version !== data.version) throw fail('Order changed. Reload before continuing.', 409, 'ORDER_CONFLICT')
                if (!actions(order).includes(action)) throw fail('This action is not available for the current order state', 409, 'INVALID_ORDER_TRANSITION')
                const previous = state(order)
                const now = new Date()
                const updates = { lock_version: order.lock_version + 1 }
                if (action === 'confirm') Object.assign(updates, { status: 'confirmed', confirmed_at: now })
                else if (action === 'mark-paid') Object.assign(updates, { payment_status: 'paid', paid_at: now, status: 'completed' })
                else if (action === 'cancel') {
                    await restoreStock(order, transaction)
                    Object.assign(updates, { status: 'cancelled', fulfillment_status: 'cancelled', cancelled_at: now, cancellation_reason: data.reason })
                } else {
                    updates.fulfillment_status = action
                    if (action === 'shipped') updates.shipped_at = now
                    if (action === 'delivered') {
                        updates.delivered_at = now
                        if (order.payment_status === 'paid') updates.status = 'completed'
                    }
                }
                await order.update(updates, { transaction })
                await OrderEvent.create({ order_id: order.id, actor_user_id: userId, action,
                    previous_state: previous, next_state: state(order), reason: data.reason || null }, { transaction })
                return detail(shop.id, id, transaction)
            })
        } catch (error) {
            if (error.original?.code !== 'ER_LOCK_DEADLOCK' || attempt === 2) throw error
        }
    }
}

module.exports = { listOrders, getOrder, changeOrder }
