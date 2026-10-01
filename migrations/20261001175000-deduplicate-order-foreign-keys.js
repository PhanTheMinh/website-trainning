module.exports = {
    async up(queryInterface) {
        const references = await queryInterface.getForeignKeyReferencesForTable('orders')
        const [rules] = await queryInterface.sequelize.query(
            'SELECT CONSTRAINT_NAME AS constraint_name, UPDATE_RULE AS update_rule, DELETE_RULE AS delete_rule FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = :table',
            { replacements: { table: 'orders' } }
        )
        const byName = new Map(rules.map(rule => [rule.constraint_name, rule]))
        const columnCounts = new Map()
        for (const reference of references) columnCounts.set(reference.constraintName, (columnCounts.get(reference.constraintName) || 0) + 1)
        const groups = new Map()
        for (const reference of references) {
            if (!['checkout_id', 'user_id', 'payment_method_id'].includes(reference.columnName)) continue
            if (columnCounts.get(reference.constraintName) !== 1) continue // Never change composite foreign keys.
            const rule = byName.get(reference.constraintName)
            if (!rule) throw new Error('Cannot verify existing order foreign-key rules. No constraints were removed.')
            const key = JSON.stringify([reference.columnName, reference.referencedTableSchema, reference.referencedTableName,
                reference.referencedColumnName, rule.update_rule, rule.delete_rule])
            const names = groups.get(key) || []
            names.push(reference.constraintName)
            groups.set(key, names)
        }
        // Only exact duplicates, including update/delete behaviour, are removed.
        for (const names of groups.values()) {
            for (const name of names.sort().slice(1)) await queryInterface.removeConstraint('orders', name)
        }
    },
    async down() {
        throw new Error('This cleanup is forward-only; duplicate foreign keys should not be recreated.')
    }
}
