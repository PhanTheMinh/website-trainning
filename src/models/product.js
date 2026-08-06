const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const Product = sequelize.define(
    'Product',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        owner_id: {
            type: DataTypes.BIGINT,
            allowNull: false
        },
        title: {
            type: DataTypes.STRING(180),
            allowNull: false
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        category: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        price: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        stock: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0
        },
        weight_grams: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true
        },
        sizes: {
            type: DataTypes.JSON,
            allowNull: true
        },
        colors: {
            type: DataTypes.JSON,
            allowNull: true
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'active'
        }
    },
    {
        tableName: 'products',
        timestamps: true,
        underscored: true
    }
)

module.exports = Product
