const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')

const app = express()

const authRoute = require('./routes/auth.route')

app.use(helmet())
app.use(cors())
app.use(express.json())

app.use('/api/auth', authRoute)

if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'))
}

app.get('/health', function (req, res) {
    return res.status(200).json({
        success: true,
        message: 'Website ban do chay bo API is running'
    })
})

app.use(function (req, res) {
    return res.status(404).json({
        success: false,
        message: 'API not found'
    })
})

module.exports = app