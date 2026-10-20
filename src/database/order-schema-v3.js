module.exports = function orderSchema(T) {
    const schema = require('./order-schema-v2')(T)
    Object.assign(schema.orders, {
        fulfillment_status: { type: T.STRING(20), allowNull: false, defaultValue: 'unfulfilled' },
        lock_version: { type: T.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
        confirmed_at: { type: T.DATE, allowNull: true },
        shipped_at: { type: T.DATE, allowNull: true },
        delivered_at: { type: T.DATE, allowNull: true },
        cancelled_at: { type: T.DATE, allowNull: true },
        cancellation_reason: { type: T.STRING(500), allowNull: true }
    })
    schema.order_events = {
        id: { type: T.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false },
        order_id: { type: T.BIGINT, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
        actor_user_id: { type: T.BIGINT, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
        action: { type: T.STRING(30), allowNull: false },
        previous_state: { type: T.JSON, allowNull: false },
        next_state: { type: T.JSON, allowNull: false },
        reason: { type: T.STRING(500), allowNull: true }
    }
    return schema
}
