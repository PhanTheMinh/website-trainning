'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE variant_image
      FROM product_variant_images AS variant_image
      INNER JOIN product_variants AS variant
        ON variant.id = variant_image.product_variant_id
      INNER JOIN product_images AS product_image
        ON product_image.product_id = variant.product_id
       AND product_image.image_url = variant_image.image_url
    `)
  },

  async down() {
    // Shared legacy rows cannot be recreated safely after product and variant
    // libraries have started evolving independently.
  }
}
