const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const ProductImage = sequelize.define(
    'ProductImage',
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
        image_url: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        sort_order: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0
        }
    },
    {
        tableName: 'product_images',
        timestamps: true,
        underscored: true
    }
)

module.exports = ProductImage
