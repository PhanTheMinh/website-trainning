'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE products
      SET status = CASE
        WHEN status = 'inactive' THEN 'unactive'
        WHEN status = 'needs_variant_setup' THEN 'draft'
        ELSE status
      END
    `)

    await queryInterface.changeColumn('products', 'status', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'draft'
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE products
      SET status = CASE
        WHEN status = 'unactive' THEN 'inactive'
        WHEN status = 'draft' THEN 'needs_variant_setup'
        ELSE status
      END
    `)

    await queryInterface.changeColumn('products', 'status', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'needs_variant_setup'
    })
  }
}
