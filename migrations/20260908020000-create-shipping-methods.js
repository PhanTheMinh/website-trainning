'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('shipping_methods', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      shop_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'shops',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      code: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'active'
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

    await queryInterface.addIndex('shipping_methods', ['shop_id', 'name'], {
      unique: true,
      name: 'shipping_methods_shop_name_unique'
    })
    await queryInterface.addIndex('shipping_methods', ['shop_id', 'code'], {
      unique: true,
      name: 'shipping_methods_shop_code_unique'
    })
    await queryInterface.addIndex('shipping_methods', ['shop_id', 'status'], {
      name: 'shipping_methods_shop_status'
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('shipping_methods')
  }
}
