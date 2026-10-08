const migration = require('../migrations/20261001170000-enforce-order-required-links')
const Sequelize = require('sequelize')
function queryInterface(missing = 0) {
    return {
        sequelize: { query: jest.fn(async () => [[{ missing }]]) },
        describeTable: jest.fn(async () => Object.fromEntries(['checkout_id', 'user_id', 'payment_method_id'].map(field => [field, { type: 'BIGINT', allowNull: true }]))),
        changeColumn: jest.fn(async () => {})
    }
}
test('enforces NOT NULL without recreating or dropping foreign keys', async () => {
    const q = queryInterface()
    await migration.up(q, Sequelize)
    expect(q.changeColumn).toHaveBeenCalledTimes(3)
    for (const [, field, attributes] of q.changeColumn.mock.calls) {
        expect(['checkout_id', 'user_id', 'payment_method_id']).toContain(field)
        expect(attributes.allowNull).toBe(false)
        expect(attributes.references).toBeUndefined()
    }
})
test('stops before any mutation when an order has missing links', async () => {
    const q = queryInterface(1)
    await expect(migration.up(q, Sequelize)).rejects.toThrow('missing required links')
    expect(q.changeColumn).not.toHaveBeenCalled()
})
test('can resume a partial MySQL DDL run without re-altering completed columns', async () => {
    const q = queryInterface()
    q.describeTable.mockResolvedValue({ checkout_id: { type: 'BIGINT', allowNull: false }, user_id: { type: 'BIGINT', allowNull: true }, payment_method_id: { type: 'BIGINT', allowNull: true } })
    await migration.up(q, Sequelize)
    expect(q.changeColumn).toHaveBeenCalledTimes(2)
})
test('rejects unexpected schema types before any column change', async () => {
    const q = queryInterface()
    q.describeTable.mockResolvedValue({ checkout_id: { type: 'VARCHAR(20)', allowNull: true }, user_id: { type: 'BIGINT', allowNull: true }, payment_method_id: { type: 'BIGINT', allowNull: true } })
    await expect(migration.up(q, Sequelize)).rejects.toThrow('Unexpected type')
    expect(q.changeColumn).not.toHaveBeenCalled()
})
