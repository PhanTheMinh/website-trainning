const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const multer = require('multer')

const uploadDirectory = path.join(process.cwd(), 'uploads', "avatars")

fs.mkdirSync(uploadDirectory, {
    recursive: true
})

const allowedMimeTypes = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp'
}

const storage = multer.diskStorage({
    destination(req, file, callback) {
        callback(null, uploadDirectory)
    },

    filename(req, file, callback) {
        const extension = allowedMimeTypes[file.mimetype]
        const userId = req.user.id
        const randomPart = crypto.randomBytes(6).toString('hex')

        const filename =
            `user-${userId}-${Date.now()}-${randomPart}${extension}`

        callback(null, filename)
    }
})

function fileFilter(req, file, callback) {
    const extension = allowedMimeTypes[file.mimetype]

    if (!extension) {
        const error = new Error(
            'Only JPEG, PNG and WebP images are allowed'
        )

        error.statusCode = 400
        return callback(error)
    }

    return callback(null, true)
}

const uploadAvatar = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024,
        files: 1
    }
})

module.exports = uploadAvatar