const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const PaymentMethod = sequelize.define(
    'PaymentMethod',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        name: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        payment_data: {
            type: DataTypes.JSON,
            allowNull: false
        },
        is_active: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false
        },
        user_id: {
            type: DataTypes.BIGINT,
            allowNull: false
        }
    },
    {
        tableName: 'payment_methods',
        timestamps: true,
        underscored: true
    }
)

module.exports = PaymentMethod
