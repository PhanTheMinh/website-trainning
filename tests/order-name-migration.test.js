const migration = require('../migrations/20261013090000-add-order-name-counters')
const Sequelize = require('sequelize')

function interfaceFor(rows, tables = [], indexes = []) {
    const transaction = { id: 'migration-test' }
    return {
        showAllTables: jest.fn(async () => tables),
        showIndex: jest.fn(async () => indexes),
        createTable: jest.fn(), addIndex: jest.fn(),
        sequelize: {
            transaction: jest.fn(callback => callback(transaction)),
            query: jest.fn(async sql => sql.startsWith('SELECT') ? [rows] : [[], {}])
        }
    }
}

describe('Test migration chuyển tên Order và khởi tạo bộ đếm', () => {
    it('Case 1 - Đánh số riêng theo user theo thứ tự ngày tạo và ID', async () => {
        const q = interfaceFor([{ id: '2', user_id: '12' }, { id: '10', user_id: '12' }, { id: '5', user_id: '25' }])
        await migration.up(q, Sequelize)
        const updates = q.sequelize.query.mock.calls.filter(([sql]) => sql.startsWith('UPDATE'))
        expect(updates.map(([, options]) => options.replacements)).toEqual([
            { id: '2', name: '#pl12_0001' }, { id: '10', name: '#pl12_0002' }, { id: '5', name: '#pl25_0001' }
        ])
        const inserts = q.sequelize.query.mock.calls.filter(([sql]) => sql.startsWith('INSERT'))
        expect(inserts.map(([, options]) => options.replacements)).toEqual([
            { userId: '12', number: '2' }, { userId: '25', number: '1' }
        ])
        expect(q.sequelize.query.mock.calls[0][0]).toContain('ORDER BY orders.user_id, orders.created_at, orders.id')
        expect(q.addIndex).toHaveBeenCalledWith('orders', ['order_name'], { unique: true, name: 'orders_order_name_unique' })
    })
    it('Case 2 - Chạy lại migration đã hoàn thành không đổi tên hoặc reset bộ đếm', async () => {
        const q = interfaceFor([], ['order_name_counters'], [{ name: 'orders_order_name_unique' }])
        await migration.up(q, Sequelize)
        expect(q.createTable).not.toHaveBeenCalled()
        expect(q.sequelize.transaction).not.toHaveBeenCalled()
        expect(q.addIndex).not.toHaveBeenCalled()
    })
    it('Case 3 - Database chưa có Order vẫn tạo bộ đếm và unique index', async () => {
        const q = interfaceFor([])
        await migration.up(q, Sequelize)
        expect(q.createTable).toHaveBeenCalledTimes(1)
        expect(q.addIndex).toHaveBeenCalledTimes(1)
        expect(q.sequelize.query).toHaveBeenCalledTimes(1)
    })
})
