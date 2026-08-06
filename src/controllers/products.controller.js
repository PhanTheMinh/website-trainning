const productService = require('../services/products.service')
const { productsUrlPrefix } = require('../config/uploads')
const { removeFile, isValidImageFile } = require('../utils/avatar-file')
const {
    createProductSchema,
    listProductsQuerySchema
} = require('../validators/product.validator')

function parseVariantList(value) {
    if (Array.isArray(value)) {
        return value
    }

    if (value === undefined || value === null || value === '') {
        return []
    }

    try {
        const parsedValue = JSON.parse(value)

        if (Array.isArray(parsedValue)) {
            return parsedValue
        }
    } catch {
        return String(value)
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
    }

    return value
}

async function removeUploadedFiles(files) {
    await Promise.all(
        (files || []).map((file) => removeFile(file.path))
    )
}

async function listProducts(req, res, next) {
    try {
        const validation = listProductsQuerySchema.validate(req.query)

        if (validation.error) {
            const error = new Error(
                validation.error.details
                    .map((detail) => detail.message)
                    .join('. ')
            )
            error.statusCode = 400
            throw error
        }

        const products = await productService.listProducts(validation.value)

        return res.status(200).json({
            success: true,
            message: 'Products retrieved successfully',
            data: products
        })
    } catch (error) {
        return next(error)
    }
}

async function getProduct(req, res, next) {
    try {
        const product = await productService.getProductById(req.params.id)

        return res.status(200).json({
            success: true,
            message: 'Product retrieved successfully',
            data: product
        })
    } catch (error) {
        return next(error)
    }
}

async function createProduct(req, res, next) {
    const uploadedFiles = req.files || []
    let databaseUpdated = false

    try {
        if (!uploadedFiles.length) {
            const error = new Error('At least one product image is required')
            error.statusCode = 400
            throw error
        }

        const payload = {
            ...req.body,
            weight_grams: req.body.weight_grams || null,
            sizes: parseVariantList(req.body.sizes),
            colors: parseVariantList(req.body.colors)
        }

        const validation = createProductSchema.validate(payload)

        if (validation.error) {
            const error = new Error(
                validation.error.details
                    .map((detail) => detail.message)
                    .join('. ')
            )
            error.statusCode = 400
            throw error
        }

        const imageValidity = await Promise.all(
            uploadedFiles.map((file) =>
                isValidImageFile(file.path, file.mimetype)
            )
        )

        if (imageValidity.some((isValid) => !isValid)) {
            const error = new Error('Invalid product image content')
            error.statusCode = 400
            throw error
        }

        const imageUrls = uploadedFiles.map(
            (file) => `${productsUrlPrefix}/${file.filename}`
        )

        const product = await productService.createProduct(
            req.user.id,
            validation.value,
            imageUrls
        )

        databaseUpdated = true

        return res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: product
        })
    } catch (error) {
        if (!databaseUpdated) {
            try {
                await removeUploadedFiles(uploadedFiles)
            } catch (cleanupError) {
                console.error(
                    'Unable to clean product images:',
                    cleanupError.message
                )
            }
        }

        return next(error)
    }
}

module.exports = {
    createProduct,
    getProduct,
    listProducts
}
