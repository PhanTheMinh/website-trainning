const express = require('express')
const router = express.Router()

const shopController = require('../controllers/shops.controller')
const authenticate = require('../middlewares/auth.middleware')

router.get('/me', authenticate, shopController.getManagedShop)
router.patch('/me', authenticate, shopController.updateShop)
router.post('/', authenticate, shopController.createShop)
router.get('/:identifier/products', shopController.listShopProducts)
router.get('/:identifier', shopController.getPublicShop)

module.exports = router
