// Final schema: one order per shop, linked directly to checkout.
module.exports = function orderSchema(T) {
    const schema = require('./order-schema-v1')(T)
    delete schema.order_groups
    delete schema.order_payments
    delete schema.orders.order_group_id
    const fk = table => ({ type: T.BIGINT, allowNull: false, references: { model: table, key: 'id' },
        onUpdate: 'CASCADE', onDelete: 'RESTRICT' })
    Object.assign(schema.orders, {
        checkout_id: fk('CheckOutToken'), user_id: fk('users'), payment_method_id: fk('payment_methods'),
        payment_method_data: { type: T.JSON, allowNull: false },
        payment_status: { type: T.STRING(20), allowNull: false }, paid_at: { type: T.DATE, allowNull: true }
    })
    return schema
}
