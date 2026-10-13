const { randomUUID } = require('node:crypto')

// Tạm dừng tạo Order khi chuyển bộ đếm từ người mua sang chủ shop.
module.exports = {
    async up(q, T) {
        const Order = q.sequelize.define('StoreNameMigrationOrder', {
            id: { type: T.BIGINT, primaryKey: true }, shop_id: T.BIGINT,
            order_name: T.STRING(100), created_at: T.DATE
        }, { tableName: 'orders', timestamps: false })
        const Shop = q.sequelize.define('StoreNameMigrationShop', {
            id: { type: T.BIGINT, primaryKey: true }, owner_user_id: T.BIGINT
        }, { tableName: 'shops', timestamps: false })
        const Counter = q.sequelize.define('StoreNameMigrationCounter',
            require('../src/database/order-schema-v4')(T).order_name_counters,
            { tableName: 'order_name_counters', timestamps: false })
        await q.sequelize.transaction(async transaction => {
            // Bao gồm cả shop đã xóa mềm để không bỏ sót đơn lịch sử.
            const shops = await Shop.findAll({ attributes: [[T.cast(T.col('id'), 'CHAR'), 'id'],
                [T.cast(T.col('owner_user_id'), 'CHAR'), 'owner_user_id']],
                order: [[T.col('StoreNameMigrationShop.id'), 'ASC']], transaction, lock: transaction.LOCK.UPDATE })
            const owners = new Map(shops.map(shop => [String(shop.id), String(shop.owner_user_id)]))
            const orders = await Order.findAll({ attributes: [[T.cast(T.col('id'), 'CHAR'), 'id'],
                [T.cast(T.col('shop_id'), 'CHAR'), 'shop_id']],
                order: ['shop_id', 'created_at', 'id'].map(field => [T.col(`StoreNameMigrationOrder.${field}`), 'ASC']),
                transaction, lock: transaction.LOCK.UPDATE })
            if (orders.some(order => !owners.has(String(order.shop_id)))) throw new Error('Order thiếu shop liên kết')
            // Đổi sang tên tạm trước để không va chạm unique index với tên theo người mua.
            const prefix = `STORE-MIG-${randomUUID()}`
            for (const order of orders) {
                await Order.update({ order_name: `${prefix}-${order.id}` }, { where: { id: order.id }, transaction })
            }
            const counters = new Map()
            for (const order of orders) {
                const ownerId = owners.get(String(order.shop_id))
                const number = (counters.get(ownerId) || 0n) + 1n
                counters.set(ownerId, number)
                await Order.update({ order_name: `#pl${ownerId}_${String(number).padStart(4, '0')}` },
                    { where: { id: order.id }, transaction })
            }
            // Bảng này trước đây đếm theo buyer; thay toàn bộ bằng bộ đếm của chủ shop.
            await Counter.destroy({ where: {}, transaction })
            if (counters.size) await Counter.bulkCreate(Array.from(counters, ([user_id, number]) =>
                ({ user_id, last_number: String(number) })), { transaction })
        })
    },
    async down() {
        throw new Error('Cần backup đã kiểm tra để khôi phục tên và bộ đếm theo người mua.')
    }
}
