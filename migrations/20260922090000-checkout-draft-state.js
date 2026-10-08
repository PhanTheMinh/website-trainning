'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('CheckOutToken', 'items', {
      type: Sequelize.JSON, allowNull: true
    })
    await queryInterface.addColumn('CheckOutToken', 'version', {
      type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1
    })
    await queryInterface.addColumn('CheckOutToken', 'request_id', {
      type: Sequelize.UUID, allowNull: true
    })
    await queryInterface.addIndex('CheckOutToken', ['user_id', 'request_id'], {
      name: 'checkout_user_request_unique', unique: true
    })
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('CheckOutToken', 'checkout_user_request_unique')
    await queryInterface.removeColumn('CheckOutToken', 'request_id')
    await queryInterface.removeColumn('CheckOutToken', 'version')
    await queryInterface.removeColumn('CheckOutToken', 'items')
  }
}
