const express = require('express')
const controller = require('../controllers/checkout.controller')
const authenticate = require('../middlewares/auth.middleware')
const router = express.Router()

router.post('/shipping-options', controller.shippingOptions)
router.post('/', authenticate, controller.create)
router.get('/', authenticate, controller.list)
router.get('/:token', authenticate, controller.get)
router.patch('/:token', authenticate, controller.update)

module.exports = router
