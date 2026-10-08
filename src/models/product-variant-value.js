const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const ProductVariantValue = sequelize.define(
    'ProductVariantValue',
    {
        product_variant_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            primaryKey: true
        },
        product_option_value_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            primaryKey: true
        }
    },
    {
        tableName: 'product_variant_values',
        timestamps: false,
        underscored: true
    }
)

module.exports = ProductVariantValue
