'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `UPDATE product_variants AS product_variant
          INNER JOIN products AS product
                  ON product.id = product_variant.product_id
             SET product_variant.price = product.price
           WHERE product_variant.price IS NULL`
    )

    await queryInterface.changeColumn('product_variants', 'price', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false
    })
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('product_variants', 'price', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: true
    })
  }
}
