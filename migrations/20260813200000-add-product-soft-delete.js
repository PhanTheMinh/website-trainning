'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true
    })

    await queryInterface.addIndex(
      'products',
      ['owner_id', 'deleted_at'],
      {
        name: 'products_owner_deleted_at'
      }
    )
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'products',
      'products_owner_deleted_at'
    )
    await queryInterface.removeColumn('products', 'deleted_at')
  }
}
