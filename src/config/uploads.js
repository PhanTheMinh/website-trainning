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

const checkoutAddressesDirectory = path.join(
    uploadsRoot,
    'checkout-addresses'
)

const checkoutAddressesUrlPrefix = '/uploads/checkout-addresses'

module.exports = {
    uploadsRoot,
    avatarsDirectory,
    avatarsUrlPrefix,
    productsDirectory,
    productsUrlPrefix,
    checkoutAddressesDirectory,
    checkoutAddressesUrlPrefix
}
