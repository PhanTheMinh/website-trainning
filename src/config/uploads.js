const path = require('path')

const uploadsRoot = path.resolve(
    __dirname,
    '..',
    'uploads'
)

const avatarsDirectory = path.join(
    uploadsRoot,
    'avatars'
)

const avatarsUrlPrefix = '/uploads/avatars'

const productsDirectory = path.join(
    uploadsRoot,
    'products'
)

const productsUrlPrefix = '/uploads/products'

module.exports = {
    uploadsRoot,
    avatarsDirectory,
    avatarsUrlPrefix,
    productsDirectory,
    productsUrlPrefix
}
