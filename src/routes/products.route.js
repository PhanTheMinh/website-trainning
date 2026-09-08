const express = require('express')
const { rateLimit } = require('express-rate-limit')
const router = express.Router()

const productController = require('../controllers/products.controller')
const authenticate = require('../middlewares/auth.middleware')
const uploadProductImages = require(
    '../middlewares/product-upload.middleware'
)

const purchaseValidationLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 240,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many purchase validation requests. Please try again later.'
    }
})

router.get('/', productController.listProducts)
router.post(
    '/purchase-validation',
    purchaseValidationLimiter,
    productController.validatePurchase
)
router.get('/mine', authenticate, productController.listOwnProducts)
router.get(
    '/mine/trash',
    authenticate,
    productController.listDeletedProducts
)
router.post(
    '/mine/bulk-delete',
    authenticate,
    productController.bulkSoftDeleteProducts
)
router.patch(
    '/mine/bulk-status',
    authenticate,
    productController.bulkUpdateProductStatus
)
router.get(
    '/mine/:id',
    authenticate,
    productController.getManagedProduct
)
router.patch(
    '/mine/:id',
    authenticate,
    uploadProductImages,
    productController.updateProduct
)
router.patch(
    '/mine/:id/restore',
    authenticate,
    productController.restoreProduct
)
router.delete(
    '/mine/:id/permanent',
    authenticate,
    productController.permanentlyDeleteProduct
)
router.delete(
    '/mine/:id',
    authenticate,
    productController.softDeleteProduct
)
router.post(
    '/',
    authenticate,
    uploadProductImages,
    productController.createProduct
)
router.patch(
    '/:productId/variants/:variantId/stock',
    authenticate,
    productController.updateVariantStock
)
router.get('/:id', productController.getProduct)

module.exports = router
