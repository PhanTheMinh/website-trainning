const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')
const schema = require('../database/order-schema-v2')(DataTypes)
const names = { GeoCountry: 'geo_countries', Province: 'provinces', Customer: 'customers',
    Order: 'orders', OrderItem: 'order_items', OrderAddress: 'order_addresses' }

module.exports = Object.fromEntries(Object.entries(names).map(([name, tableName]) =>
    [name, sequelize.define(name, schema[tableName], { tableName, timestamps: true, underscored: true })]))
