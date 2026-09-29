'use strict'

module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('CheckOutToken', 'checkout_token', {
      type: Sequelize.UUID,
      allowNull: true,
      unique: true
    })
  },
  async down (queryInterface) {
    await queryInterface.removeColumn('CheckOutToken', 'checkout_token')
  }
}
