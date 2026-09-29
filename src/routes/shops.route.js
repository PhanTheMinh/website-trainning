const express = require('express')
const router = express.Router()

const shopController = require('../controllers/shops.controller')
const authenticate = require('../middlewares/auth.middleware')

router.get('/me', authenticate, shopController.getManagedShop)
router.patch('/me', authenticate, shopController.updateShop)
router.get(
    '/me/shipping-methods',
    authenticate,
    shopController.listShippingMethods
)
router.post(
    '/me/shipping-methods',
    authenticate,
    shopController.createShippingMethod
)
router.patch(
    '/me/shipping-methods/:methodId/status',
    authenticate,
    shopController.updateShippingMethodStatus
)
router.get(
    '/me/payment-methods',
    authenticate,
    shopController.listPaymentMethods
)
router.post(
    '/me/payment-methods',
    authenticate,
    shopController.createPaymentMethod
)
router.get(
    '/me/payment-methods/:methodId',
    authenticate,
    shopController.getPaymentMethod
)
router.patch(
    '/me/payment-methods/:methodId',
    authenticate,
    shopController.updatePaymentMethod
)
router.patch(
    '/me/payment-methods/:methodId/status',
    authenticate,
    shopController.updatePaymentMethodStatus
)
router.delete(
    '/me/payment-methods/:methodId',
    authenticate,
    shopController.deletePaymentMethod
)
router.get('/me/countries', authenticate, shopController.listCountries)
router.post('/me/countries', authenticate, shopController.createCountry)
router.delete(
    '/me/countries/:countryId',
    authenticate,
    shopController.deleteCountry
)
router.get('/me/shipping-rates', authenticate, shopController.listShippingRates)
router.post('/me/shipping-rates', authenticate, shopController.createShippingRate)
router.get(
    '/me/shipping-rates/:rateId',
    authenticate,
    shopController.getShippingRate
)
router.patch(
    '/me/shipping-rates/:rateId',
    authenticate,
    shopController.updateShippingRate
)
router.delete(
    '/me/shipping-rates/:rateId',
    authenticate,
    shopController.deleteShippingRate
)
router.post('/', authenticate, shopController.createShop)
router.get('/:identifier/products', shopController.listShopProducts)
router.get('/:identifier', shopController.getPublicShop)

module.exports = router
