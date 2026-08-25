const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const ProductVariant = sequelize.define(
    'ProductVariant',
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
        sku: {
            type: DataTypes.STRING(64),
            allowNull: false,
            unique: true
        },
        variant_key: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        price: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: true
        },
        image_url: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        stock_quantity: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'active'
        },
        is_default: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        }
    },
    {
        tableName: 'product_variants',
        timestamps: true,
        underscored: true
    }
)

module.exports = ProductVariant
