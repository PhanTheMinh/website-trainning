// Frozen v1 schema shared by the additive migration and Sequelize models.
module.exports = function orderSchema(T) {
    const id = () => ({ type: T.BIGINT, primaryKey: true, autoIncrement: true, allowNull: false })
    const str = (size, nullable = false) => ({ type: T.STRING(size), allowNull: nullable })
    const fk = (table, nullable = false) => ({ type: T.BIGINT, allowNull: nullable,
        references: { model: table, key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' })
    const money = () => ({ type: T.DECIMAL(18, 2), allowNull: false })
    const days = () => ({ type: T.INTEGER.UNSIGNED, allowNull: false })
    const address = () => ({ country_id: fk('geo_countries'), province_id: fk('provinces', true),
        city: str(100), ward: str(100, true), street: str(200), house_number: str(50, true),
        apartment: str(100, true), postal_code: str(20, true) })
    return {
        geo_countries: { id: id(), code: { ...str(2), unique: true }, name: str(100), phone_code: str(8, true) },
        provinces: { id: id(), country_id: fk('geo_countries'), code: str(20), name: str(100) },
        customers: { id: id(), email: str(254), email_key: { ...str(254), unique: true },
            first_name: str(100), last_name: str(100), phone: str(30), ...address() },
        order_groups: { id: id(), checkout_id: { ...fk('CheckOutToken'), unique: true },
            user_id: fk('users'), customer_id: fk('customers'), request_id: str(36), currency: str(3) },
        orders: { id: id(), order_group_id: fk('order_groups'), customer_id: fk('customers'), shop_id: fk('shops'),
            order_code: { ...str(50), unique: true }, order_name: str(100), status: str(20),
            sub_total: money(), shipping_fee: money(), order_total: money(), currency: str(3),
            shipping_method_id: fk('shipping_methods'), shipping_rate_id: fk('shipping_rates'),
            shipping_method_name: str(100), shipping_method_code: str(50),
            min_delivery_days: days(), max_delivery_days: days(),
            estimated_delivery_from: { type: T.DATEONLY, allowNull: false },
            estimated_delivery_to: { type: T.DATEONLY, allowNull: false } },
        order_items: { id: id(), order_id: fk('orders'), product_id: fk('products'),
            product_variant_id: fk('product_variants'), product_name: str(180), sku: str(64),
            variant_data: { type: T.JSON, allowNull: false }, image_url: { type: T.TEXT, allowNull: true },
            quantity: days(), unit_price: money(), line_total: money() },
        order_addresses: { id: id(), order_id: { ...fk('orders'), unique: true },
            recipient_first_name: str(100), recipient_last_name: str(100), email: str(254), phone: str(30),
            ...address(), country_code: str(2), country_name: str(100),
            province_code: str(20, true), province_name: str(100, true) },
        order_payments: { id: id(), order_id: { ...fk('orders'), unique: true }, payment_method_id: fk('payment_methods'),
            method_type: str(30), method_name: str(100), description: { type: T.TEXT, allowNull: true },
            instructions: { type: T.TEXT, allowNull: true }, amount: money(), currency: str(3),
            status: str(20), paid_at: { type: T.DATE, allowNull: true } }
    }
}
