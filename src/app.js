const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const session = require('express-session')
const SequelizeStore = require('connect-session-sequelize')(session.Store)
const sequelize = require('./config/database')

const sessionSecret = process.env.SESSION_SECRET

if (!sessionSecret) {
    throw new Error('SESSION_SECRET is required')
}

const app = express()

const authRoute = require('./routes/auth.route')
const userRoute = require('./routes/users.route')

app.use(helmet())
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}))
app.use(express.json())

const sessionStore = new SequelizeStore({
    db: sequelize,
    tableName: 'sessions',
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: 24 * 60 * 60 * 1000
})

app.use(session({
    store: sessionStore,
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: "lax",
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
