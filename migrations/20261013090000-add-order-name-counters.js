// Khi triển khai phải tạm dừng tạo đơn đến khi migration và code mới cùng sẵn sàng.
module.exports = {
    async up(q, T) {
        const tables = await q.showAllTables()
        if (!tables.includes('order_name_counters')) {
            await q.createTable('order_name_counters', {
                user_id: { type: T.BIGINT, primaryKey: true, allowNull: false,
                    references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
                last_number: { type: T.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 }
            })
        }
        // MySQL DDL không nằm trong transaction; phần chuyển tên và bộ đếm vẫn atomic.
        const indexes = await q.showIndex('orders')
        if (!indexes.some(index => index.name === 'orders_order_name_unique')) {
            await q.sequelize.transaction(async transaction => {
                const [orders] = await q.sequelize.query(
                    'SELECT CAST(id AS CHAR) AS id, CAST(user_id AS CHAR) AS user_id FROM orders ORDER BY orders.user_id, orders.created_at, orders.id FOR UPDATE', { transaction })
                const counters = new Map()
                for (const order of orders) {
                    const userId = String(order.user_id)
                    const number = (counters.get(userId) || 0n) + 1n
                    counters.set(userId, number)
                    await q.sequelize.query('UPDATE orders SET order_name = :name WHERE id = :id', {
                        replacements: { name: `#pl${userId}_${String(number).padStart(4, '0')}`, id: order.id }, transaction
                    })
                }
                for (const [userId, number] of counters) {
                    await q.sequelize.query(`INSERT INTO order_name_counters (user_id, last_number) VALUES (:userId, :number)
                        ON DUPLICATE KEY UPDATE last_number = GREATEST(last_number, VALUES(last_number))`, {
                        replacements: { userId, number: String(number) }, transaction
                    })
                }
            })
            await q.addIndex('orders', ['order_name'], { unique: true, name: 'orders_order_name_unique' })
        }
    },
    async down() {
        throw new Error('Tên đơn cũ đã được chuyển đổi. Cần khôi phục backup đã kiểm tra để rollback migration này.')
    }
}
