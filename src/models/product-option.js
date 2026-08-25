const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const ProductOption = sequelize.define(
    'ProductOption',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        product_id: {
            type: DataTypes.BIGINT,
            allowNull: false
        },
        code: {
            type: DataTypes.STRING(50),
            allowNull: false
        },
        name: {
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
        tableName: 'product_options',
        timestamps: true,
        underscored: true
    }
)

module.exports = ProductOption
