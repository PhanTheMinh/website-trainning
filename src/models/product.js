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
        category_id: {
            type: DataTypes.BIGINT,
            allowNull: true
        },
        brand: {
            type: DataTypes.STRING(100),
            allowNull: true
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
            type: DataTypes.STRING(30),
            allowNull: false,
            defaultValue: 'draft'
        },
        deleted_at: {
            type: DataTypes.DATE,
            allowNull: true
        },
        lock_version: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0
        }
    },
    {
        tableName: 'products',
        timestamps: true,
        paranoid: true,
        deletedAt: 'deleted_at',
        underscored: true
    }
)

module.exports = Product
