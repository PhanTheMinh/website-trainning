'use strict'

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE shops
      INNER JOIN users ON users.id = shops.owner_user_id
      SET shops.name = users.full_name
      WHERE shops.slug = CONCAT('shop-', shops.owner_user_id)
        AND shops.name = CONCAT('Gian hàng ', users.full_name)
    `)
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      UPDATE shops
      INNER JOIN users ON users.id = shops.owner_user_id
      SET shops.name = CONCAT('Gian hàng ', users.full_name)
      WHERE shops.slug = CONCAT('shop-', shops.owner_user_id)
        AND shops.name = users.full_name
    `)
  }
}
