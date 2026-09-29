const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const CheckoutToken = sequelize.define('CheckoutToken', {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    user_id: { type: DataTypes.BIGINT, allowNull: true },
    checkout_token: { type: DataTypes.UUID, allowNull: true, unique: true },
    request_id: { type: DataTypes.UUID, allowNull: true },
    items: { type: DataTypes.JSON, allowNull: true },
    version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
    shop_used_id: { type: DataTypes.BIGINT, allowNull: false },
    is_completed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    shipping_address: { type: DataTypes.TEXT, allowNull: false },
    total: { type: DataTypes.TEXT, allowNull: false },
    shipping_method: { type: DataTypes.TEXT, allowNull: false },
    payment_method: { type: DataTypes.JSON, allowNull: true }
}, { tableName: 'CheckOutToken', timestamps: true, underscored: true })

module.exports = CheckoutToken
