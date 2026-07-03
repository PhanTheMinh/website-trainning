const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const User = sequelize.define(
    'User',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        full_name: {
            type: DataTypes.STRING(100),
            allowNull: false
        },
        email: {
            type: DataTypes.STRING(150),
            allowNull: false,
            unique: true
        },
        phone: {
            type: DataTypes.STRING(20),
            allowNull: true,
            unique: true
        },
        password: {
            type: DataTypes.STRING(255),
            allowNull: false
        },
        role: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'user'
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'active'
        }
    },
    {
        tableName: 'users',
        timestamps: true,
        underscored: true
    }
)

module.exports = User