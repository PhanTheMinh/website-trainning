module.exports = function orderSchema(T) {
    const schema = require('./order-schema-v3')(T)
    schema.orders.order_name = { ...schema.orders.order_name, unique: true }
    schema.order_name_counters = {
        user_id: { type: T.BIGINT, primaryKey: true, allowNull: false,
            references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        last_number: { type: T.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 }
    }
    return schema
}
