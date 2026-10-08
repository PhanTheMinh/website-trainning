'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('countries', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      shop_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'shops', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      country_code: {
        type: Sequelize.STRING(2),
        allowNull: false
      },
      phone_code: {
        type: Sequelize.STRING(8),
        allowNull: false
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

    await queryInterface.addIndex('countries', ['shop_id', 'country_code'], {
      unique: true,
      name: 'countries_shop_country_code_unique'
    })
    await queryInterface.addIndex('countries', ['shop_id', 'name'], {
      unique: true,
      name: 'countries_shop_name_unique'
    })

    await queryInterface.createTable('shipping_rates', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      shipping_method_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'shipping_methods', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      min_delivery_days: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      max_delivery_days: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false
      },
      fixed_fee: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: false
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

    await queryInterface.addIndex('shipping_rates', ['shipping_method_id'], {
      name: 'shipping_rates_shipping_method'
    })

    await queryInterface.createTable('shipping_rate_countries', {
      shipping_rate_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        allowNull: false,
        references: { model: 'shipping_rates', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      country_id: {
        type: Sequelize.BIGINT,
        primaryKey: true,
        allowNull: false,
        references: { model: 'countries', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
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

    await queryInterface.addIndex('shipping_rate_countries', ['country_id'], {
      name: 'shipping_rate_countries_country'
    })
  },

  async down(queryInterface) {
    await queryInterface.dropTable('shipping_rate_countries')
    await queryInterface.dropTable('shipping_rates')
    await queryInterface.dropTable('countries')
  }
}
