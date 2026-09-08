const express = require('express')
const { rateLimit } = require('express-rate-limit')
const router = express.Router()

const authController = require('../controllers/auth.controller')
const authenticate = require('../middlewares/auth.middleware')

const authenticationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        success: false,
        message: 'Too many authentication attempts. Please try again later.'
    }
})

router.post('/register', authenticationLimiter, authController.register)
router.post('/login', authenticationLimiter, authController.login)
router.post('/logout', authenticate, authController.logout)

module.exports = router
