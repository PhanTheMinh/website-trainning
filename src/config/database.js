const { Sequelize } = require('sequelize')
require('dotenv').config({ quiet: true })

const databaseName = process.env.NODE_ENV === 'test'
    ? process.env.DB_TEST_NAME || 'website_ban_do_chay_bo_test'
    : process.env.DB_NAME

const sequelize = new Sequelize(
    databaseName,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        dialect: 'mysql',
        logging: false,
        timezone: '+07:00',
        define: {
            timestamps: true,
            underscored: true
        }
    }
)

module.exports = sequelize
