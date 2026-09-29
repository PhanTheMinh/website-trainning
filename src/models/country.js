const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const Country = sequelize.define(
    'Country',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        shop_id: {
            type: DataTypes.BIGINT,
            allowNull: false
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        country_code: {
            type: DataTypes.STRING(2),
            allowNull: false
        },
        phone_code: {
            type: DataTypes.STRING(8),
            allowNull: false
        }
    },
    {
        tableName: 'countries',
        timestamps: true,
        underscored: true
    }
)

module.exports = Country
