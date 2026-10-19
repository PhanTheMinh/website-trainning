const { cast, col } = require('sequelize')
const { Shop, OrderNameCounter } = require('../models')

async function allocateOrderNames(shopId, count, transaction) {
    if (!transaction || !Number.isSafeInteger(count) || count < 1) throw new Error('Invalid order name allocation')
    // Một user sở hữu một shop. Khóa shop để cấp số riêng và xử lý lần đầu an toàn.
    const shop = await Shop.findByPk(shopId, { attributes: ['id', 'owner_user_id'], transaction, lock: transaction.LOCK.UPDATE })
    if (!shop) throw new Error('Order shop not found')
    const userId = shop.owner_user_id
    const [counter] = await OrderNameCounter.findOrCreate({
        where: { user_id: userId }, defaults: { last_number: 0 },
        transaction, lock: transaction.LOCK.UPDATE
    })
    await counter.increment('last_number', { by: count, transaction })
    // Đọc BIGINT dạng chuỗi để không mất chính xác khi số vượt giới hạn Number.
    await counter.reload({ attributes: ['user_id', [cast(col('last_number'), 'CHAR'), 'last_number']], transaction })
    const last = BigInt(counter.last_number)
    return Array.from({ length: count }, (_, index) =>
        `#pl${userId}_${last - BigInt(count) + 1n + BigInt(index)}`)
}

module.exports = { allocateOrderNames }
