'use strict'

module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('products', 'lock_version', {
            type: Sequelize.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0
        })
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('products', 'lock_version')
    }
}
