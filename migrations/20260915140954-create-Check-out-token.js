'use strict';

module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('CheckOutToken', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      shop_used_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
      },
      is_completed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      shipping_address: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      total: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      shipping_method: {
        type: Sequelize.TEXT,
        allowNull: false,
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
  },

  async down (queryInterface, _Sequelize) {
    await queryInterface.dropTable('CheckOutToken')
  }
};
