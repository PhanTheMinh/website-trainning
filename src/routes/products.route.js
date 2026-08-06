const express = require('express')
const router = express.Router()

const productController = require('../controllers/products.controller')
const authenticate = require('../middlewares/auth.middleware')
const uploadProductImages = require(
    '../middlewares/product-upload.middleware'
)

router.get('/', productController.listProducts)
router.get('/:id', productController.getProduct)
router.post(
    '/',
    authenticate,
    uploadProductImages,
    productController.createProduct
)

module.exports = router
