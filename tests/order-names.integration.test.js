const { v4: uuid } = require('uuid')
const sequelize = require('../src/config/database')
const { User, Shop, OrderNameCounter } = require('../src/models')
const { allocateOrderNames } = require('../src/services/order-names.service')
const users = []
const shops = []
const allocate = (user, count) => sequelize.transaction(transaction => allocateOrderNames(shops[users.indexOf(user)].id, count, transaction))

describe('Test bộ đếm tên Order riêng theo chủ shop', () => {
    beforeAll(async () => {
        for (let i = 0; i < 3; i++) {
            users.push(await User.create({ full_name: 'Order name tester', email: `names-${uuid()}@example.com`,
                password: 'test-only', role: 'user', status: 'active' }))
            shops.push(await Shop.create({ owner_user_id: users[i].id, name: 'Counter shop', slug: `counter-${uuid()}`, status: 'active' }))
        }
    })
    afterAll(async () => {
        try { await User.destroy({ where: { id: users.map(user => user.id) } }) }
        finally { await sequelize.close() }
    })
    it('Case 1 - Mỗi chủ shop bắt đầu riêng từ 0001 và tăng theo số Order của shop', async () => {
        expect(await allocate(users[0], 2)).toEqual([`#pl${users[0].id}_0001`, `#pl${users[0].id}_0002`])
        expect(await allocate(users[1], 1)).toEqual([`#pl${users[1].id}_0001`])
    })
    it('Case 2 - Hai transaction đồng thời không cấp trùng tên', async () => {
        const groups = await Promise.all([allocate(users[0], 2), allocate(users[0], 2)])
        expect(groups.flat().sort()).toEqual([3, 4, 5, 6].map(n => `#pl${users[0].id}_${String(n).padStart(4, '0')}`))
    })
    it('Case 3 - Rollback không tiêu thụ số và không thay đổi bộ đếm', async () => {
        await expect(sequelize.transaction(async transaction => {
            await allocateOrderNames(shops[0].id, 2, transaction)
            throw new Error('Lỗi tạo đơn giả lập')
        })).rejects.toThrow('Lỗi tạo đơn giả lập')
        expect(await allocate(users[0], 1)).toEqual([`#pl${users[0].id}_0007`])
    })
    it('Case 4 - Sau 9999 tiếp tục 10000 mà không cắt chữ số', async () => {
        await OrderNameCounter.update({ last_number: 9998 }, { where: { user_id: users[1].id } })
        expect(await allocate(users[1], 2)).toEqual([`#pl${users[1].id}_9999`, `#pl${users[1].id}_10000`])
    })
    it('Case 5 - Không cho cấp tên ngoài transaction hoặc số lượng không hợp lệ', async () => {
        await expect(allocateOrderNames(shops[0].id, 1)).rejects.toThrow('Invalid order name allocation')
        await expect(allocate(users[0], 0)).rejects.toThrow('Invalid order name allocation')
    })
    it('Case 6 - Hai yêu cầu đầu tiên cùng user vẫn khởi tạo bộ đếm không trùng', async () => {
        const groups = await Promise.all([allocate(users[2], 1), allocate(users[2], 1)])
        expect(groups.flat().sort()).toEqual([`#pl${users[2].id}_0001`, `#pl${users[2].id}_0002`])
    })
})
