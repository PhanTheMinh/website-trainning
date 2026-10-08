const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const ShippingRate = sequelize.define(
    'ShippingRate',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        shipping_method_id: {
            type: DataTypes.BIGINT,
            allowNull: false
        },
        min_delivery_days: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false
        },
        max_delivery_days: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false
        },
        fixed_fee: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        }
    },
    {
        tableName: 'shipping_rates',
        timestamps: true,
        underscored: true
    }
)

module.exports = ShippingRate
