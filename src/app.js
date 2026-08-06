const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const morgan = require('morgan')
const session = require('express-session')
const SequelizeStore = require('connect-session-sequelize')(session.Store)
const sequelize = require('./config/database')
const {uploadsRoot} = require('./config/uploads')
const multer = require('multer')

const sessionSecret = process.env.SESSION_SECRET
const allowedOrigins = (
    process.env.FRONTEND_ORIGINS ||
    'http://localhost:5173,http://127.0.0.1:5173'
)
    .split(',')
    .map(function (origin) {
        return origin.trim()
    })
    .filter(Boolean)

if (!sessionSecret) {
    throw new Error('SESSION_SECRET is required')
}

const app = express()

const authRoute = require('./routes/auth.route')
const userRoute = require('./routes/users.route')
const productRoute = require('./routes/products.route')

app.use(helmet())
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true)
        }

        const error = new Error('Origin is not allowed by CORS')
        error.statusCode = 403
        return callback(error)
    },
    credentials: true
}))

app.use(
    '/uploads',
    function allowAvatarCrossOrigin(req, res, next) {
        res.setHeader(
            'Cross-Origin-Resource-Policy',
            'cross-origin'
        )

        return next()
    },
    express.static(uploadsRoot, {
        maxAge: '1y',
        immutable: true
    })
)


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
app.use('/api/products', productRoute)

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

app.use(function errorHandler(error, req, res, next) {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                message: error.field === 'images'
                    ? 'Each product image must not exceed 5 MB'
                    : 'Avatar must not exceed 2 MB'
            })
        }

        return res.status(400).json({
            success: false,
            message: error.message
        })
    }

    const statusCode = error.statusCode || 500

    return res.status(statusCode).json({
        success: false,
        message: statusCode >= 500
            ? 'Internal server error'
            : error.message
    })
})


module.exports = app
