const { DataTypes } = require('sequelize')
const sequelize = require('../config/database')

const Shop = sequelize.define(
    'Shop',
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true
        },
        owner_user_id: {
            type: DataTypes.BIGINT,
            allowNull: false,
            unique: true
        },
        name: {
            type: DataTypes.STRING(120),
            allowNull: false
        },
        slug: {
            type: DataTypes.STRING(180),
            allowNull: false,
            unique: true
        },
        logo_url: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        cover_url: {
            type: DataTypes.STRING(255),
            allowNull: true
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        status: {
            type: DataTypes.STRING(20),
            allowNull: false,
            defaultValue: 'active'
        },
        deleted_at: {
            type: DataTypes.DATE,
            allowNull: true
        }
    },
    {
        tableName: 'shops',
        timestamps: true,
        paranoid: true,
        deletedAt: 'deleted_at',
        underscored: true
    }
)

module.exports = Shop
