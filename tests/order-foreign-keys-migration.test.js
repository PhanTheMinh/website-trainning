const migration = require('../migrations/20261001175000-deduplicate-order-foreign-keys')
function queryInterface(deleteRule = 'RESTRICT') {
    return {
        getForeignKeyReferencesForTable: jest.fn(async () => ['a', 'b'].map(constraintName => ({ constraintName, columnName: 'checkout_id', referencedTableSchema: 'test', referencedTableName: 'checkouttoken', referencedColumnName: 'id' }))),
        sequelize: { query: jest.fn(async () => [[{ constraint_name: 'a', update_rule: 'CASCADE', delete_rule: 'RESTRICT' }, { constraint_name: 'b', update_rule: 'CASCADE', delete_rule: deleteRule }]]) },
        removeConstraint: jest.fn(async () => {})
    }
}
test('removes only the duplicate and retains one identical constraint', async () => {
    const q = queryInterface()
    await migration.up(q)
    expect(q.removeConstraint).toHaveBeenCalledTimes(1)
    expect(q.removeConstraint).toHaveBeenCalledWith('orders', 'b')
})
test('never removes constraints with different referential actions', async () => {
    const q = queryInterface('CASCADE')
    await migration.up(q)
    expect(q.removeConstraint).not.toHaveBeenCalled()
})
test('stops before mutation if rules cannot be verified', async () => {
    const q = queryInterface()
    q.sequelize.query.mockResolvedValue([[]])
    await expect(migration.up(q)).rejects.toThrow('Cannot verify')
    expect(q.removeConstraint).not.toHaveBeenCalled()
})
test('does not modify composite keys', async () => {
    const q = queryInterface()
    const references = await q.getForeignKeyReferencesForTable()
    q.getForeignKeyReferencesForTable.mockResolvedValue([...references, ...references.map(reference => ({ ...reference, columnName: 'shop_id' }))])
    await migration.up(q)
    expect(q.removeConstraint).not.toHaveBeenCalled()
})
