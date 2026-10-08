const productService = require('../services/products.service')
const shopService = require('../services/shops.service')
const shippingMethodsService = require('../services/shipping-methods.service')
const shippingSettingsService = require('../services/shipping-settings.service')
const paymentMethodsService = require('../services/payment-methods.service')
const {
    listProductsQuerySchema
} = require('../validators/product.validator')
const {
    createShopSchema,
    updateShopSchema
} = require('../validators/shop.validator')
const {
    createShippingMethodSchema,
    listShippingMethodsQuerySchema,
    updateShippingMethodStatusSchema
} = require('../validators/shipping-method.validator')
const {
    createCountrySchema,
    listCountriesQuerySchema,
    createShippingRateSchema,
    listShippingRatesQuerySchema,
    updateShippingRateSchema
} = require('../validators/shipping-settings.validator')
const {
    createPaymentMethodSchema,
    listPaymentMethodsQuerySchema,
    updatePaymentMethodSchema,
    updatePaymentMethodStatusSchema
} = require('../validators/payment-method.validator')

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

async function listShippingMethods(req, res, next) {
    try {
        const validation = listShippingMethodsQuerySchema.validate(req.query)
        throwValidationError(validation)
        const result = await shippingMethodsService.listShippingMethods(
            req.user.id,
            validation.value
        )

        return res.status(200).json({
            success: true,
            message: 'Shipping methods retrieved successfully',
            data: result.items,
            pagination: result.pagination
        })
    } catch (error) {
        return next(error)
    }
}

async function createShippingMethod(req, res, next) {
    try {
        const validation = createShippingMethodSchema.validate(req.body)
        throwValidationError(validation)
        const method = await shippingMethodsService.createShippingMethod(
            req.user.id,
            validation.value
        )

        return res.status(201).json({
            success: true,
            message: 'Shipping method created successfully',
            data: method
        })
    } catch (error) {
        return next(error)
    }
}

async function updateShippingMethodStatus(req, res, next) {
    try {
        const validation = updateShippingMethodStatusSchema.validate(req.body)
        throwValidationError(validation)
        const method = await shippingMethodsService.updateShippingMethodStatus(
            req.user.id,
            req.params.methodId,
            validation.value.status
        )

        return res.status(200).json({
            success: true,
            message: 'Shipping method status updated successfully',
            data: method
        })
    } catch (error) {
        return next(error)
    }
}

async function listCountries(req, res, next) {
    try {
        const validation = listCountriesQuerySchema.validate(req.query)
        throwValidationError(validation)
        const result = await shippingSettingsService.listCountries(
            req.user.id,
            validation.value
        )
        return res.status(200).json({
            success: true,
            message: 'Countries retrieved successfully',
            data: result.items,
            pagination: result.pagination
        })
    } catch (error) {
        return next(error)
    }
}

async function createCountry(req, res, next) {
    try {
        const validation = createCountrySchema.validate(req.body)
        throwValidationError(validation)
        const country = await shippingSettingsService.createCountry(
            req.user.id,
            validation.value
        )

        return res.status(201).json({
            success: true,
            message: 'Country created successfully',
            data: country
        })
    } catch (error) {
        return next(error)
    }
}

async function deleteCountry(req, res, next) {
    try {
        await shippingSettingsService.deleteCountry(
            req.user.id,
            req.params.countryId
        )
        return res.status(204).send()
    } catch (error) {
        return next(error)
    }
}

async function listShippingRates(req, res, next) {
    try {
        const validation = listShippingRatesQuerySchema.validate(req.query)
        throwValidationError(validation)
        const result = await shippingSettingsService.listShippingRates(
            req.user.id,
            validation.value
        )
        return res.status(200).json({
            success: true,
            message: 'Shipping rates retrieved successfully',
            data: result.items,
            pagination: result.pagination
        })
    } catch (error) {
        return next(error)
    }
}

async function getShippingRate(req, res, next) {
    try {
        const rate = await shippingSettingsService.getShippingRate(
            req.user.id,
            req.params.rateId
        )
        return res.status(200).json({
            success: true,
            message: 'Shipping rate retrieved successfully',
            data: rate
        })
    } catch (error) {
        return next(error)
    }
}

async function createShippingRate(req, res, next) {
    try {
        const validation = createShippingRateSchema.validate(req.body)
        throwValidationError(validation)
        const rate = await shippingSettingsService.createShippingRate(
            req.user.id,
            validation.value
        )

        return res.status(201).json({
            success: true,
            message: 'Shipping rate created successfully',
            data: rate
        })
    } catch (error) {
        return next(error)
    }
}

async function updateShippingRate(req, res, next) {
    try {
        const validation = updateShippingRateSchema.validate(req.body)
        throwValidationError(validation)
        const rate = await shippingSettingsService.updateShippingRate(
            req.user.id,
            req.params.rateId,
            validation.value
        )
        return res.status(200).json({
            success: true,
            message: 'Shipping rate updated successfully',
            data: rate
        })
    } catch (error) {
        return next(error)
    }
}

async function deleteShippingRate(req, res, next) {
    try {
        await shippingSettingsService.deleteShippingRate(
            req.user.id,
            req.params.rateId
        )
        return res.status(204).send()
    } catch (error) {
        return next(error)
    }
}

async function listPaymentMethods(req, res, next) {
    try {
        const validation = listPaymentMethodsQuerySchema.validate(req.query)
        throwValidationError(validation)
        const result = await paymentMethodsService.listPaymentMethods(
            req.user.id,
            validation.value
        )
        return res.status(200).json({
            success: true,
            message: 'Payment methods retrieved successfully',
            data: result.items,
            pagination: result.pagination
        })
    } catch (error) {
        return next(error)
    }
}

async function getPaymentMethod(req, res, next) {
    try {
        const method = await paymentMethodsService.getPaymentMethod(
            req.user.id,
            req.params.methodId
        )
        return res.status(200).json({
            success: true,
            message: 'Payment method retrieved successfully',
            data: method
        })
    } catch (error) {
        return next(error)
    }
}

async function createPaymentMethod(req, res, next) {
    try {
        const validation = createPaymentMethodSchema.validate(req.body)
        throwValidationError(validation)
        const method = await paymentMethodsService.createPaymentMethod(
            req.user.id,
            validation.value
        )
        return res.status(201).json({
            success: true,
            message: 'Payment method created successfully',
            data: method
        })
    } catch (error) {
        return next(error)
    }
}

async function updatePaymentMethod(req, res, next) {
    try {
        const validation = updatePaymentMethodSchema.validate(req.body)
        throwValidationError(validation)
        const method = await paymentMethodsService.updatePaymentMethod(
            req.user.id,
            req.params.methodId,
            validation.value
        )
        return res.status(200).json({
            success: true,
            message: 'Payment method updated successfully',
            data: method
        })
    } catch (error) {
        return next(error)
    }
}

async function updatePaymentMethodStatus(req, res, next) {
    try {
        const validation = updatePaymentMethodStatusSchema.validate(req.body)
        throwValidationError(validation)
        const method = await paymentMethodsService.updatePaymentMethodStatus(
            req.user.id,
            req.params.methodId,
            validation.value.is_active
        )
        return res.status(200).json({
            success: true,
            message: 'Payment method status updated successfully',
            data: method
        })
    } catch (error) {
        return next(error)
    }
}

async function deletePaymentMethod(req, res, next) {
    try {
        await paymentMethodsService.deletePaymentMethod(
            req.user.id,
            req.params.methodId
        )
        return res.status(204).send()
    } catch (error) {
        return next(error)
    }
}

module.exports = {
    createCountry,
    createPaymentMethod,
    createShippingRate,
    createShippingMethod,
    createShop,
    deleteCountry,
    deletePaymentMethod,
    deleteShippingRate,
    getShippingRate,
    getManagedShop,
    getPaymentMethod,
    getPublicShop,
    listCountries,
    listPaymentMethods,
    listShippingRates,
    listShippingMethods,
    listShopProducts,
    updateShippingMethodStatus,
    updatePaymentMethod,
    updatePaymentMethodStatus,
    updateShippingRate,
    updateShop
}
