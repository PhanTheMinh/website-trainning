const User = require('./user')
const Product = require('./product')
const ProductImage = require('./product-image')

User.hasMany(Product, {
    as: 'products',
    foreignKey: 'owner_id'
})

Product.belongsTo(User, {
    as: 'owner',
    foreignKey: 'owner_id'
})

Product.hasMany(ProductImage, {
    as: 'images',
    foreignKey: 'product_id'
})

ProductImage.belongsTo(Product, {
    as: 'product',
    foreignKey: 'product_id'
})

module.exports = {
    User,
    Product,
    ProductImage
}
