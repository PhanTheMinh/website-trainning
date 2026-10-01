const express = require('express')
const controller = require('../controllers/checkout.controller')
const authenticate = require('../middlewares/auth.middleware')
const router = express.Router()
const { rateLimit } = require('express-rate-limit')
router.post('/street-list', authenticate, rateLimit({
    windowMs: 60 * 1000, limit: 10, keyGenerator: req => String(req.user.id),
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Too many street list requests. Please try again shortly.' }
}), controller.streetList)

router.post('/street-suggestions', authenticate, rateLimit({
    windowMs: 60 * 1000, limit: 30, keyGenerator: req => String(req.user.id),
    standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Too many street searches. Enter your street manually or try again shortly.' }
}), controller.streetSuggestions)

router.post('/shipping-options', controller.shippingOptions)
router.post('/', authenticate, controller.create)
router.get('/', authenticate, controller.list)
router.get('/:token/orders', authenticate, require('../controllers/orders.controller').getCheckoutOrders)
router.get('/:token', authenticate, controller.get)
router.patch('/:token', authenticate, controller.update)

module.exports = router
