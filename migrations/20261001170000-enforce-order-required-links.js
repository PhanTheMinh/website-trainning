const fields = ['checkout_id', 'user_id', 'payment_method_id']

module.exports = {
    async up(queryInterface, Sequelize) {
        const [rows] = await queryInterface.sequelize.query(
            'SELECT COUNT(*) AS missing FROM orders WHERE checkout_id IS NULL OR user_id IS NULL OR payment_method_id IS NULL'
        )
        if (Number(rows[0].missing)) {
            throw new Error('Orders contain missing required links. Restore their valid references before applying this migration; no rows were modified.')
        }
        const columns = await queryInterface.describeTable('orders')
        for (const field of fields) {
            if (!columns[field]) throw new Error(`Missing orders.${field}; run the preceding order migrations first.`)
            if (!/^BIGINT(?:\(\d+\))?$/i.test(columns[field].type)) {
                throw new Error(`Unexpected type for orders.${field}. Review the schema before changing constraints.`)
            }
        }
        for (const field of fields) {
            if (!columns[field].allowNull) continue
            // MySQL's Sequelize generator handles REFERENCES as ADD FOREIGN KEY,
            // not MODIFY COLUMN. Leave the existing foreign key untouched.
            await queryInterface.changeColumn('orders', field, { type: Sequelize.BIGINT, allowNull: false })
        }
    },
    async down() {
        throw new Error('This integrity migration is forward-only. Do not relax required order links; restore a reviewed backup if rollback is needed.')
    }
}
