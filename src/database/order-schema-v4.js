module.exports = function orderSchema(T) {
    const schema = require('./order-schema-v3')(T)
    schema.orders.order_name = { ...schema.orders.order_name, unique: true }
    return schema
}
