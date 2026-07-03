require('dotenv').config()

const app = require('./app')
const sequelize = require('./config/database')
require('./models')

const PORT = process.env.PORT || 3000

async function startServer() {
    try {

        console.log('DB_NAME:', process.env.DB_NAME)
        console.log('DB_HOST:', process.env.DB_HOST)
        await sequelize.authenticate()

        console.log('Database connected successfully')

        app.listen(PORT, function () {
            console.log(`Server is running on port ${PORT}`)
        })
    } catch (error) {
        console.error('Unable to connect to database:', error.message)
        process.exit(1)
    }
}

startServer()