module.exports = {
    async up(q, T) {
        // Only pending orders can be safely initialized as unfulfilled. Do not guess legacy delivery states.
        const [rows] = await q.sequelize.query("SELECT COUNT(*) AS unsupported FROM orders WHERE status NOT IN ('pending', 'cancelled') OR payment_status NOT IN ('unpaid', 'paid')")
        if (Number(rows[0].unsupported)) throw new Error('Review existing order states before applying the seller lifecycle migration.')
        const schema = require('../src/database/order-schema-v3')(T)
        const columns = await q.describeTable('orders')
        for (const field of ['fulfillment_status', 'lock_version', 'confirmed_at', 'shipped_at', 'delivered_at', 'cancelled_at', 'cancellation_reason']) {
            if (!columns[field]) await q.addColumn('orders', field, schema.orders[field])
        }
        await q.sequelize.query("UPDATE orders SET fulfillment_status = 'cancelled' WHERE status = 'cancelled'")
        await q.createTable('order_events', { ...schema.order_events,
            created_at: { type: T.DATE, allowNull: false }, updated_at: { type: T.DATE, allowNull: false } })
        await q.addIndex('order_events', ['order_id', 'created_at'], { name: 'order_events_order_created' })
        await q.addIndex('orders', ['shop_id', 'created_at', 'id'], { name: 'orders_shop_created' })
    },
    async down() {
        throw new Error('Restore a reviewed backup to remove order lifecycle data and history.')
    }
}
