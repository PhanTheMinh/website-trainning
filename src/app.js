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

function resolveTrustProxy(value) {
    if (value === undefined || value === '') {
        return process.env.NODE_ENV === 'production' ? 1 : false
    }

    const normalizedValue = String(value).trim().toLowerCase()

    if (['false', 'off', 'no', '0'].includes(normalizedValue)) {
        return false
    }

    if (['true', 'on', 'yes'].includes(normalizedValue)) {
        return 1
    }

    if (/^\d+$/.test(normalizedValue)) {
        return Number(normalizedValue)
    }

    return value
}

function resolveSessionSameSite(value) {
    const sameSite = String(value || 'lax').trim().toLowerCase()

    if (!['lax', 'strict', 'none'].includes(sameSite)) {
        throw new Error(
            'SESSION_COOKIE_SAME_SITE must be lax, strict or none'
        )
    }

    return sameSite
}

if (!sessionSecret) {
    throw new Error('SESSION_SECRET is required')
}

const app = express()
const trustProxy = resolveTrustProxy(process.env.TRUST_PROXY)
const sessionCookieSameSite = resolveSessionSameSite(
    process.env.SESSION_COOKIE_SAME_SITE
)

if (trustProxy !== false) {
    app.set('trust proxy', trustProxy)
}

const authRoute = require('./routes/auth.route')
const userRoute = require('./routes/users.route')
const categoryRoute = require('./routes/categories.route')
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
        sameSite: sessionCookieSameSite,
        maxAge: 1000 * 60 * 60 * 24
    }
}))

app.use('/api/auth', authRoute)
app.use('/api/users',userRoute)
app.use('/api/categories', categoryRoute)
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

app.use(function errorHandler(error, req, res, _next) {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                message: ['images', 'variant_images'].includes(error.field)
                    ? 'Each product image must not exceed 5 MB'
                    : 'Avatar must not exceed 2 MB'
            })
        }

        if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                success: false,
                message: 'A product can contain at most 12 images'
            })
        }

        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                success: false,
                message: error.field === 'variant_images'
                    ? 'A request can contain at most 48 variant images'
                    : 'A product can contain at most 12 images'
            })
        }

        return res.status(400).json({
            success: false,
            message: error.message
        })
    }

    const statusCode = error.statusCode || 500

    if (statusCode >= 500 && process.env.NODE_ENV !== 'test') {
        console.error(error)
    }

    return res.status(statusCode).json({
        success: false,
        message: statusCode >= 500
            ? 'Internal server error'
            : error.message
    })
})


module.exports = app
