const fs = require('fs')
const crypto = require('crypto')
const multer = require('multer')
const { productsDirectory } = require('../config/uploads')
const { removeFile } = require('../utils/avatar-file')

fs.mkdirSync(productsDirectory, {
    recursive: true
})

const allowedMimeTypes = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
}

const storage = multer.diskStorage({
    destination(req, file, callback) {
        callback(null, productsDirectory)
    },

    filename(req, file, callback) {
        const extension = allowedMimeTypes[file.mimetype]
        const userId = req.user.id
        const randomPart = crypto.randomBytes(6).toString('hex')

        callback(
            null,
            `product-${userId}-${Date.now()}-${randomPart}${extension}`
        )
    }
})

function fileFilter(req, file, callback) {
    if (!allowedMimeTypes[file.mimetype]) {
        const error = new Error(
            'Only JPEG, PNG and WebP product images are allowed'
        )

        error.statusCode = 400
        return callback(error)
    }

    return callback(null, true)
}

const productImageUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 6
    }
})

function uploadProductImages(req, res, next) {
    productImageUpload.array('images', 6)(
        req,
        res,
        function handleUpload(error) {
            if (!error) {
                return next()
            }

            Promise.all(
                (req.files || []).map((file) => removeFile(file.path))
            )
                .then(function finishCleanup() {
                    return next(error)
                })
                .catch(function handleCleanupError(cleanupError) {
                    console.error(
                        'Unable to clean product images:',
                        cleanupError.message
                    )
                    return next(error)
                })
        }
    )
}

module.exports = uploadProductImages
