const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const session = require('express-session')


const app = express()

const authRoute = require('./routes/auth.route')
const userRoute = require('./routes/users.route')

app.use(helmet())
app.use(cors({
    origin: true,
    credentials: true
}))
app.use(express.json())

app.use(session({
    secret: process.env.SESSION_SECRET || 'website_ban_do_chay_bo_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24
    }
}))

app.use('/api/auth', authRoute)
app.use('/api/users',userRoute)

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