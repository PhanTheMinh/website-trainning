const schema = require('../src/database/order-schema-v1')
const { countries } = require('../shared/checkout-geography.json')

module.exports = {
    async up(queryInterface, Sequelize) {
        const tables = schema(Sequelize)
        // MySQL DDL is not transactional. Never use sync({ force: true }).
        for (const [name, columns] of Object.entries(tables)) {
            await queryInterface.createTable(name, { ...columns,
                created_at: { type: Sequelize.DATE, allowNull: false },
                updated_at: { type: Sequelize.DATE, allowNull: false } })
        }
        await queryInterface.addIndex('provinces', ['country_id', 'code'], { unique: true })
        await queryInterface.addIndex('order_groups', ['user_id', 'request_id'], { unique: true })
        await queryInterface.addIndex('orders', ['order_group_id', 'shop_id'], { unique: true })
        await queryInterface.addIndex('order_items', ['order_id', 'product_variant_id'], { unique: true })
        const now = new Date()
        const countryRows = countries.map((country, i) => ({ id: i + 1, code: country.code,
            name: country.name, phone_code: country.phone_code || null, created_at: now, updated_at: now }))
        await queryInterface.bulkInsert('geo_countries', countryRows)
        const provinceRows = countries.flatMap((country, i) => country.provinces.map((region, j) => ({
            country_id: i + 1, code: region.code || `LOCAL-${j + 1}`, name: region.name, created_at: now, updated_at: now })))
        for (let i = 0; i < provinceRows.length; i += 500) {
            await queryInterface.bulkInsert('provinces', provinceRows.slice(i, i + 500))
        }
    },
    async down(queryInterface) {
        for (const name of Object.keys(schema(require('sequelize'))).reverse()) await queryInterface.dropTable(name)
    }
}
