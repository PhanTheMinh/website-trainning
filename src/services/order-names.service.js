const sequelize = require('../config/database')

async function allocateOrderNames(userId, count, transaction) {
    if (!transaction || !Number.isSafeInteger(count) || count < 1) throw new Error('Invalid order name allocation')
    // INSERT xử lý user lần đầu; UPDATE khóa dòng bộ đếm đến khi transaction kết thúc.
    await sequelize.query(`INSERT INTO order_name_counters (user_id, last_number) VALUES (:userId, :count)
        ON DUPLICATE KEY UPDATE last_number = last_number + VALUES(last_number)`, {
        replacements: { userId, count }, transaction
    })
    const [rows] = await sequelize.query(
        'SELECT CAST(last_number AS CHAR) AS last_number FROM order_name_counters WHERE user_id = :userId FOR UPDATE', {
            replacements: { userId }, transaction
        })
    const last = BigInt(rows[0].last_number)
    return Array.from({ length: count }, (_, index) =>
        `#pl${userId}_${String(last - BigInt(count) + 1n + BigInt(index)).padStart(4, '0')}`)
}

module.exports = { allocateOrderNames }
