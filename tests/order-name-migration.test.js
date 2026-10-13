const migration = require('../migrations/20261013090000-add-order-name-counters')
const Sequelize = require('sequelize')

function interfaceFor(rows, tables = [], indexes = []) {
    const transaction = { id: 'migration-test', LOCK: { UPDATE: 'UPDATE' } }
    const orderModel = { findAll: jest.fn(async () => rows), update: jest.fn() }
    const counterModel = { findOrCreate: jest.fn(async ({ defaults }) => [{ last_number: defaults.last_number, update: jest.fn() }]) }
    return {
        orderModel, counterModel,
        showAllTables: jest.fn(async () => tables),
        showIndex: jest.fn(async () => indexes),
        createTable: jest.fn(), addIndex: jest.fn(),
        sequelize: {
            transaction: jest.fn(callback => callback(transaction)),
            define: jest.fn(name => name === 'OrderNameMigrationOrder' ? orderModel : counterModel)
        }
    }
}

describe('Test migration chuyển tên Order và khởi tạo bộ đếm', () => {
    it('Case 1 - Đánh số riêng theo user theo thứ tự ngày tạo và ID', async () => {
        const q = interfaceFor([{ id: '2', user_id: '12' }, { id: '10', user_id: '12' }, { id: '5', user_id: '25' }])
        await migration.up(q, Sequelize)
        expect(q.orderModel.update.mock.calls.map(([values, options]) => ({ ...values, id: options.where.id }))).toEqual([
            { id: '2', order_name: '#pl12_0001' }, { id: '10', order_name: '#pl12_0002' }, { id: '5', order_name: '#pl25_0001' }
        ])
        expect(q.counterModel.findOrCreate.mock.calls.map(([options]) => ({ ...options.where, ...options.defaults }))).toEqual([
            { user_id: '12', last_number: '2' }, { user_id: '25', last_number: '1' }
        ])
        expect(q.orderModel.findAll.mock.calls[0][0].order).toEqual(
            ['user_id', 'created_at', 'id'].map(field => [Sequelize.col(`OrderNameMigrationOrder.${field}`), 'ASC']))
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
        expect(q.orderModel.findAll).toHaveBeenCalledTimes(1)
        expect(q.orderModel.update).not.toHaveBeenCalled()
    })
})
