const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const ShippingRateCountry = sequelize.define(
    'ShippingRateCountry',
    {
        shipping_rate_id: {
            type: DataTypes.BIGINT,
            primaryKey: true
        },
        country_id: {
            type: DataTypes.BIGINT,
            primaryKey: true
        }
    },
    {
        tableName: 'shipping_rate_countries',
        timestamps: true,
        underscored: true
    }
)

module.exports = ShippingRateCountry
