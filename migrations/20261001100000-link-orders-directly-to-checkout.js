module.exports = {
    async up(q, T) {
        const schema = require('../src/database/order-schema-v2')(T).orders
        await q.addColumn('CheckOutToken', 'order_request_id', { type: T.STRING(36), allowNull: true })
        for (const field of ['checkout_id', 'user_id', 'payment_method_id', 'payment_method_data', 'payment_status', 'paid_at']) {
            await q.addColumn('orders', field, { ...schema[field], allowNull: true })
        }
        // Preserve any v1 orders/payment snapshots before removing the old structures.
        await q.sequelize.query(`UPDATE orders o JOIN order_groups g ON g.id = o.order_group_id
            JOIN order_payments p ON p.order_id = o.id
            SET o.checkout_id = g.checkout_id, o.user_id = g.user_id,
                o.payment_method_id = p.payment_method_id, o.payment_status = p.status, o.paid_at = p.paid_at,
                o.payment_method_data = JSON_OBJECT('id', p.payment_method_id, 'type', p.method_type,
                    'name', p.method_name, 'description', p.description, 'instructions', p.instructions)`)
        await q.sequelize.query(`UPDATE CheckOutToken c JOIN order_groups g ON g.checkout_id = c.id
            SET c.order_request_id = g.request_id`)
        for (const field of ['checkout_id', 'user_id', 'payment_method_id', 'payment_method_data', 'payment_status']) {
            await q.changeColumn('orders', field, schema[field])
        }
        await q.addIndex('CheckOutToken', ['user_id', 'order_request_id'], { unique: true, name: 'checkout_order_request_unique' })
        await q.addIndex('orders', ['checkout_id', 'shop_id'], { unique: true, name: 'orders_checkout_shop_unique' })
        const refs = await q.getForeignKeyReferencesForTable('orders')
        for (const ref of refs.filter(ref => ref.columnName === 'order_group_id')) await q.removeConstraint('orders', ref.constraintName)
        for (const index of await q.showIndex('orders')) {
            if (index.fields.some(field => field.attribute === 'order_group_id')) await q.removeIndex('orders', index.name)
        }
        await q.removeColumn('orders', 'order_group_id')
        await q.dropTable('order_payments')
        await q.dropTable('order_groups')
    },
    async down() {
        throw new Error('This data-preserving consolidation is forward-only. Restore a database backup to return to v1.')
    }
}
