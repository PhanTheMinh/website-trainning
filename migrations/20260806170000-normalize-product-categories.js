'use strict'

const { Op } = require('sequelize')
const categories = require('../shared/product-categories.json')

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      for (const category of categories) {
        await queryInterface.bulkUpdate(
          'products',
          {
            category: category.value
          },
          {
            category: {
              [Op.in]: category.aliases
            }
          },
          {
            transaction
          }
        )
      }
    })
  },

  async down() {
    // Data normalization is intentionally not reversed because newly created
    // products also use the canonical values and must not be changed to aliases.
  }
}
