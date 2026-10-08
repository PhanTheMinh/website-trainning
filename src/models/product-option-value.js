const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const ProductOptionValue = sequelize.define(
    'ProductOptionValue',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        product_option_id: {
            type: DataTypes.BIGINT,
            allowNull: false
        },
        value: {
            type: DataTypes.STRING(80),
            allowNull: false
        },
        sort_order: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0
        }
    },
    {
        tableName: 'product_option_values',
        timestamps: true,
        underscored: true
    }
)

module.exports = ProductOptionValue
