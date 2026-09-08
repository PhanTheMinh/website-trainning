'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_variant_images', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      product_variant_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'product_variants',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      image_url: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      sort_order: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    })

    await queryInterface.addIndex(
      'product_variant_images',
      ['product_variant_id', 'sort_order'],
      { name: 'product_variant_images_variant_order' }
    )

    await queryInterface.sequelize.query(`
      INSERT INTO product_variant_images
        (product_variant_id, image_url, sort_order, created_at, updated_at)
      SELECT id, image_url, 0, created_at, updated_at
      FROM product_variants
      WHERE image_url IS NOT NULL AND image_url <> ''
    `)
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_variant_images')
  }
}
