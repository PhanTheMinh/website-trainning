'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'address', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'phone'
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'address')
  }
}
