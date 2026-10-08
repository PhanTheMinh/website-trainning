'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE products
      SET status = CASE
        WHEN status = 'published' THEN 'active'
        WHEN status = 'draft' THEN 'inactive'
        ELSE status
      END
    `)

    await queryInterface.changeColumn('products', 'status', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'needs_variant_setup'
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      UPDATE products
      SET status = CASE
        WHEN status = 'active' THEN 'published'
        WHEN status = 'inactive' THEN 'draft'
        ELSE status
      END
    `)

    await queryInterface.changeColumn('products', 'status', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'draft'
    })
  }
}
