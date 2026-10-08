const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const ShippingMethod = sequelize.define(
    'ShippingMethod',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        shop_id: {
            type: DataTypes.BIGINT,
            allowNull: false
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        code: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        description: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'active'
        }
    },
    {
        tableName: 'shipping_methods',
        timestamps: true,
        underscored: true
    }
)

module.exports = ShippingMethod
