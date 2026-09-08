const productService = require('../services/products.service')
const shopService = require('../services/shops.service')
const {
    listProductsQuerySchema
} = require('../validators/product.validator')
const {
    createShopSchema,
    updateShopSchema
} = require('../validators/shop.validator')

function throwValidationError(validation) {
    if (!validation.error) return

    const error = new Error(
        validation.error.details.map((detail) => detail.message).join('. ')
    )
    error.statusCode = 400
    throw error
}

async function createShop(req, res, next) {
    try {
        const validation = createShopSchema.validate(req.body)
        throwValidationError(validation)
        const shop = await shopService.createShop(req.user.id, validation.value)

        return res.status(201).json({
            success: true,
            message: 'Shop created successfully',
            data: shop
        })
    } catch (error) {
        return next(error)
    }
}

async function getManagedShop(req, res, next) {
    try {
        const shop = await shopService.getManagedShop(req.user.id)

        return res.status(200).json({
            success: true,
            message: shop
                ? 'Shop retrieved successfully'
                : 'This account does not have a shop yet',
            data: shop
        })
    } catch (error) {
        return next(error)
    }
}

async function updateShop(req, res, next) {
    try {
        const validation = updateShopSchema.validate(req.body)
        throwValidationError(validation)
        const shop = await shopService.updateShop(req.user.id, validation.value)

        return res.status(200).json({
            success: true,
            message: 'Shop updated successfully',
            data: shop
        })
    } catch (error) {
        return next(error)
    }
}

async function getPublicShop(req, res, next) {
    try {
        const shop = await shopService.getPublicShop(req.params.identifier)

        return res.status(200).json({
            success: true,
            message: shop.status === 'closed'
                ? 'Shop is temporarily closed'
                : 'Shop retrieved successfully',
            data: shop
        })
    } catch (error) {
        return next(error)
    }
}

async function listShopProducts(req, res, next) {
    try {
        const validation = listProductsQuerySchema.validate(req.query)
        throwValidationError(validation)
        const shop = await shopService.getPublicShop(
            req.params.identifier,
            { requireActive: true }
        )
        const result = await productService.listProducts({
            ...validation.value,
            shopId: shop.id
        })

        return res.status(200).json({
            success: true,
            message: 'Shop products retrieved successfully',
            shop,
            data: result.items,
            pagination: result.pagination,
            facets: result.facets
        })
    } catch (error) {
        return next(error)
    }
}

module.exports = {
    createShop,
    getManagedShop,
    getPublicShop,
    listShopProducts,
    updateShop
}
