'use strict'

module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('CheckOutToken', 'user_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })
    await queryInterface.addIndex('CheckOutToken', ['user_id', 'is_completed'], {
      name: 'checkout_token_user_status'
    })
  },

  async down (queryInterface) {
    await queryInterface.removeIndex('CheckOutToken', 'checkout_token_user_status')
    await queryInterface.removeColumn('CheckOutToken', 'user_id')
  }
}
