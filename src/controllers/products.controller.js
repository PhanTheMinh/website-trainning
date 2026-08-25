const productService = require('../services/products.service')
const fs = require('fs/promises')
const path = require('path')
const {
    productsDirectory,
    productsUrlPrefix
} = require('../config/uploads')
const {
    removeFile,
    detectImageFileType
} = require('../utils/avatar-file')
const {
    bulkDeleteProductsSchema,
    bulkUpdateProductStatusSchema,
    createProductSchema,
    listDeletedProductsQuerySchema,
    listOwnProductsQuerySchema,
    listProductsQuerySchema,
    updateProductSchema,
    updateVariantStockSchema
} = require('../validators/product.validator')

const generatedProductImagePattern =
    /^product-\d+-\d+-[a-f0-9]{12}\.(?:jpg|png|webp|avif)$/

function parseJsonField(value, fallback) {
    if (typeof value === 'object' && value !== null) {
        return value
    }

    if (value === undefined || value === null || value === '') {
        return fallback
    }

    try {
        return JSON.parse(value)
    } catch {
        return value
    }
}

async function removeUploadedFiles(files) {
    await Promise.all(
        (files || []).map((file) => removeFile(file.path))
    )
}

async function removeStoredProductImages(imageUrls) {
    const failures = []

    await Promise.all((imageUrls || []).map(async (imageUrl) => {
        if (!imageUrl?.startsWith(`${productsUrlPrefix}/`)) {
            return
        }

        const filename = path.basename(imageUrl)

        if (!generatedProductImagePattern.test(filename)) {
            return
        }

        try {
            await removeFile(path.join(productsDirectory, filename))
        } catch (error) {
            failures.push({
                image_url: imageUrl,
                message: error.message
            })
        }
    }))

    return failures
}

function throwValidationError(validation) {
    if (!validation.error) {
        return
    }

    const error = new Error(
        validation.error.details
            .map((detail) => detail.message)
            .join('. ')
    )
    error.statusCode = 400
    throw error
}

async function inspectUploadedImages(uploadedFiles) {
    const inspectedImages = await Promise.all(
        uploadedFiles.map(async (file) => ({
            file,
            detectedType: await detectImageFileType(file.path)
        }))
    )
    const invalidImages = inspectedImages.filter(
        (image) => !image.detectedType
    )

    if (invalidImages.length) {
        const invalidNames = invalidImages
            .map((image) => image.file.originalname)
            .join(', ')
        const error = new Error(
            `Invalid product image content: ${invalidNames}. ` +
            'The file content must be valid JPEG, PNG, WebP or AVIF.'
        )
        error.statusCode = 400
        throw error
    }

    await Promise.all(inspectedImages.map((image) =>
        useDetectedImageType(image.file, image.detectedType)
    ))
}

async function useDetectedImageType(file, detectedType) {
    const currentExtension = path.extname(file.filename).toLowerCase()

    if (currentExtension !== detectedType.extension) {
        const filename =
            `${path.parse(file.filename).name}${detectedType.extension}`
        const filePath = path.join(path.dirname(file.path), filename)

        await fs.rename(file.path, filePath)
        file.filename = filename
        file.path = filePath
    }

    file.mimetype = detectedType.mimetype
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

        const result = await productService.listProducts(validation.value)

        return res.status(200).json({
            success: true,
            message: 'Products retrieved successfully',
            data: result.items,
            pagination: result.pagination,
            facets: result.facets
        })
    } catch (error) {
        return next(error)
    }
}

async function listOwnProducts(req, res, next) {
    try {
        const validation = listOwnProductsQuerySchema.validate(req.query)

        if (validation.error) {
            const error = new Error(
                validation.error.details
                    .map((detail) => detail.message)
                    .join('. ')
            )
            error.statusCode = 400
            throw error
        }

        const result = await productService.listOwnProducts(
            req.user.id,
            validation.value
        )

        return res.status(200).json({
            success: true,
            message: 'Account products retrieved successfully',
            data: result
        })
    } catch (error) {
        return next(error)
    }
}

async function listDeletedProducts(req, res, next) {
    try {
        const validation = listDeletedProductsQuerySchema.validate(req.query)
        throwValidationError(validation)

        const result = await productService.listDeletedProducts(
            req.user.id,
            validation.value
        )

        return res.status(200).json({
            success: true,
            message: 'Deleted products retrieved successfully',
            data: result
        })
    } catch (error) {
        return next(error)
    }
}

async function getManagedProduct(req, res, next) {
    try {
        const product = await productService.getManagedProduct(
            req.user.id,
            req.params.id
        )

        return res.status(200).json({
            success: true,
            message: 'Account product retrieved successfully',
            data: product
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
    const productImageFiles = req.productImageFiles || []
    const variantImageFiles = req.variantImageFiles || []
    let databaseUpdated = false

    try {
        if (!productImageFiles.length && !variantImageFiles.length) {
            const error = new Error(
                'At least one product or variant image is required'
            )
            error.statusCode = 400
            throw error
        }

        const payload = {
            ...req.body,
            category_id: req.body.category_id,
            weight_grams: req.body.weight_grams || null,
            brand: req.body.brand || null,
            options: parseJsonField(req.body.options, []),
            variants: parseJsonField(req.body.variants, [])
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

        await inspectUploadedImages(uploadedFiles)

        const imageUrls = productImageFiles.map(
            (file) => `${productsUrlPrefix}/${file.filename}`
        )
        const variantImageUrls = variantImageFiles.map(
            (file) => `${productsUrlPrefix}/${file.filename}`
        )

        const product = await productService.createProduct(
            req.user.id,
            validation.value,
            imageUrls,
            variantImageUrls
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

async function updateProduct(req, res, next) {
    const uploadedFiles = req.files || []
    const productImageFiles = req.productImageFiles || []
    const variantImageFiles = req.variantImageFiles || []
    let databaseUpdated = false

    try {
        const payload = {
            ...req.body
        }

        if (Object.prototype.hasOwnProperty.call(req.body, 'brand')) {
            payload.brand = req.body.brand || null
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'weight_grams')) {
            payload.weight_grams = req.body.weight_grams || null
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'options')) {
            payload.options = parseJsonField(req.body.options, [])
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'variants')) {
            payload.variants = parseJsonField(req.body.variants, [])
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'image_order')) {
            payload.image_order = parseJsonField(req.body.image_order, [])
        }

        const validation = updateProductSchema.validate(payload)
        throwValidationError(validation)

        await inspectUploadedImages(uploadedFiles)

        const imageUrls = productImageFiles.map(
            (file) => `${productsUrlPrefix}/${file.filename}`
        )
        const variantImageUrls = variantImageFiles.map(
            (file) => `${productsUrlPrefix}/${file.filename}`
        )
        const result = await productService.updateProduct(
            req.user.id,
            req.params.id,
            validation.value,
            imageUrls,
            variantImageUrls
        )

        databaseUpdated = true

        const cleanupFailures = await removeStoredProductImages(
            [
                ...result.removedImageUrls,
                ...result.removedVariantImageUrls
            ]
        )

        return res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            data: result.product,
            ...(cleanupFailures.length
                ? {
                    warning: 'The product was updated, but some old image files could not be removed.'
                }
                : {})
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

async function softDeleteProduct(req, res, next) {
    try {
        const result = await productService.softDeleteProduct(
            req.user.id,
            req.params.id
        )

        return res.status(200).json({
            success: true,
            message: 'Product moved to trash successfully',
            data: result
        })
    } catch (error) {
        return next(error)
    }
}

async function bulkSoftDeleteProducts(req, res, next) {
    try {
        const validation = bulkDeleteProductsSchema.validate(req.body)
        throwValidationError(validation)

        const result = await productService.bulkSoftDeleteProducts(
            req.user.id,
            validation.value.ids
        )

        return res.status(200).json({
            success: true,
            message: result.deleted_count
                ? `${result.deleted_count} product(s) moved to trash`
                : 'No products were moved to trash',
            data: result
        })
    } catch (error) {
        return next(error)
    }
}

async function bulkUpdateProductStatus(req, res, next) {
    try {
        const validation = bulkUpdateProductStatusSchema.validate(req.body)
        throwValidationError(validation)

        const result = await productService.bulkUpdateProductStatus(
            req.user.id,
            validation.value.ids,
            validation.value.status
        )

        return res.status(200).json({
            success: true,
            message: result.updatedCount
                ? 'Product status updated successfully'
                : 'Products already use the requested status',
            data: result
        })
    } catch (error) {
        return next(error)
    }
}

async function restoreProduct(req, res, next) {
    try {
        const result = await productService.restoreProduct(
            req.user.id,
            req.params.id
        )

        return res.status(200).json({
            success: true,
            message: 'Product restored successfully',
            data: result.product,
            ...(result.warning ? { warning: result.warning } : {})
        })
    } catch (error) {
        return next(error)
    }
}

async function permanentlyDeleteProduct(req, res, next) {
    try {
        const result = await productService.permanentlyDeleteProduct(
            req.user.id,
            req.params.id
        )
        const cleanupFailures = await removeStoredProductImages(
            result.image_urls
        )

        return res.status(200).json({
            success: true,
            message: 'Product permanently deleted',
            data: {
                id: result.id,
                title: result.title
            },
            ...(cleanupFailures.length
                ? {
                    warning: 'The database record was deleted, but some image files could not be removed.'
                }
                : {})
        })
    } catch (error) {
        return next(error)
    }
}

async function updateVariantStock(req, res, next) {
    try {
        const validation = updateVariantStockSchema.validate(req.body)

        if (validation.error) {
            const error = new Error(
                validation.error.details
                    .map((detail) => detail.message)
                    .join('. ')
            )
            error.statusCode = 400
            throw error
        }

        const product = await productService.updateVariantStock(
            req.user.id,
            req.params.productId,
            req.params.variantId,
            validation.value.stock_quantity
        )

        return res.status(200).json({
            success: true,
            message: 'Variant stock updated successfully',
            data: product
        })
    } catch (error) {
        return next(error)
    }
}

module.exports = {
    bulkSoftDeleteProducts,
    bulkUpdateProductStatus,
    createProduct,
    getManagedProduct,
    getProduct,
    listDeletedProducts,
    listOwnProducts,
    listProducts,
    permanentlyDeleteProduct,
    restoreProduct,
    softDeleteProduct,
    updateProduct,
    updateVariantStock
}
