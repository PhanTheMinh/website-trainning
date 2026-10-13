// Khi triển khai phải tạm dừng tạo đơn đến khi migration và code mới cùng sẵn sàng.
module.exports = {
    async up(q, T) {
        const tables = await q.showAllTables()
        if (!tables.includes('order_name_counters')) {
            await q.createTable('order_name_counters', require('../src/database/order-schema-v4')(T).order_name_counters)
        }
        // MySQL DDL không nằm trong transaction; phần chuyển tên và bộ đếm vẫn atomic.
        const indexes = await q.showIndex('orders')
        if (!indexes.some(index => index.name === 'orders_order_name_unique')) {
            // Model chỉ phục vụ migration; không phụ thuộc model ứng dụng có thể đổi sau này.
            const MigrationOrder = q.sequelize.define('OrderNameMigrationOrder', {
                id: { type: T.BIGINT, primaryKey: true }, user_id: T.BIGINT,
                order_name: T.STRING(100), created_at: T.DATE
            }, { tableName: 'orders', timestamps: false })
            const MigrationCounter = q.sequelize.define('OrderNameMigrationCounter',
                require('../src/database/order-schema-v4')(T).order_name_counters,
                { tableName: 'order_name_counters', timestamps: false })
            await q.sequelize.transaction(async transaction => {
                const orders = await MigrationOrder.findAll({
                    attributes: [[T.cast(T.col('id'), 'CHAR'), 'id'], [T.cast(T.col('user_id'), 'CHAR'), 'user_id']],
                    order: ['user_id', 'created_at', 'id'].map(field => [T.col(`OrderNameMigrationOrder.${field}`), 'ASC']),
                    transaction, lock: transaction.LOCK.UPDATE
                })
                const counters = new Map()
                for (const order of orders) {
                    const userId = String(order.user_id)
                    const number = (counters.get(userId) || 0n) + 1n
                    counters.set(userId, number)
                    await MigrationOrder.update({ order_name: `#pl${userId}_${String(number).padStart(4, '0')}` },
                        { where: { id: order.id }, transaction })
                }
                for (const [userId, number] of counters) {
                    const [counter] = await MigrationCounter.findOrCreate({ where: { user_id: userId },
                        defaults: { last_number: String(number) },
                        attributes: ['user_id', [T.cast(T.col('last_number'), 'CHAR'), 'last_number']],
                        transaction, lock: transaction.LOCK.UPDATE })
                    if (BigInt(counter.last_number) < number) {
                        await counter.update({ last_number: String(number) }, { transaction })
                    }
                }
            })
            await q.addIndex('orders', ['order_name'], { unique: true, name: 'orders_order_name_unique' })
        }
    },
    async down() {
        throw new Error('Tên đơn cũ đã được chuyển đổi. Cần khôi phục backup đã kiểm tra để rollback migration này.')
    }
}
