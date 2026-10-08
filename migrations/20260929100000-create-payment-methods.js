'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_methods', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      payment_data: {
        type: Sequelize.JSON,
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      is_deleted: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
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

    await queryInterface.addIndex('payment_methods', ['user_id', 'is_deleted'], {
      name: 'payment_methods_user_deleted'
    })
    await queryInterface.addIndex('payment_methods', ['user_id', 'is_active', 'is_deleted'], {
      name: 'payment_methods_user_availability'
    })

    await queryInterface.addColumn('CheckOutToken', 'payment_method', {
      type: Sequelize.JSON,
      allowNull: true
    })
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('CheckOutToken', 'payment_method')
    await queryInterface.dropTable('payment_methods')
  }
}
