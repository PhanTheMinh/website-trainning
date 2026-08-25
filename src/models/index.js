const User = require('./user')
const Category = require('./category')
const Product = require('./product')
const ProductImage = require('./product-image')
const ProductOption = require('./product-option')
const ProductOptionValue = require('./product-option-value')
const ProductVariant = require('./product-variant')
const ProductVariantImage = require('./product-variant-image')
const ProductVariantValue = require('./product-variant-value')

User.hasMany(Product, {
    as: 'products',
    foreignKey: 'owner_id'
})

Product.belongsTo(User, {
    as: 'owner',
    foreignKey: 'owner_id'
})

Category.hasMany(Product, {
    as: 'products',
    foreignKey: 'category_id'
})

Product.belongsTo(Category, {
    as: 'categoryDetails',
    foreignKey: 'category_id'
})

Product.hasMany(ProductImage, {
    as: 'images',
    foreignKey: 'product_id'
})

ProductImage.belongsTo(Product, {
    as: 'product',
    foreignKey: 'product_id'
})

Product.hasMany(ProductOption, {
    as: 'options',
    foreignKey: 'product_id'
})

ProductOption.belongsTo(Product, {
    as: 'product',
    foreignKey: 'product_id'
})

ProductOption.hasMany(ProductOptionValue, {
    as: 'values',
    foreignKey: 'product_option_id'
})

ProductOptionValue.belongsTo(ProductOption, {
    as: 'option',
    foreignKey: 'product_option_id'
})

Product.hasMany(ProductVariant, {
    as: 'variants',
    foreignKey: 'product_id'
})

ProductVariant.belongsTo(Product, {
    as: 'product',
    foreignKey: 'product_id'
})

ProductVariant.hasMany(ProductVariantImage, {
    as: 'images',
    foreignKey: 'product_variant_id'
})

ProductVariantImage.belongsTo(ProductVariant, {
    as: 'variant',
    foreignKey: 'product_variant_id'
})

ProductVariant.belongsToMany(ProductOptionValue, {
    as: 'optionValues',
    through: ProductVariantValue,
    foreignKey: 'product_variant_id',
    otherKey: 'product_option_value_id',
    timestamps: false
})

ProductOptionValue.belongsToMany(ProductVariant, {
    as: 'variants',
    through: ProductVariantValue,
    foreignKey: 'product_option_value_id',
    otherKey: 'product_variant_id',
    timestamps: false
})

module.exports = {
    User,
    Category,
    Product,
    ProductImage,
    ProductOption,
    ProductOptionValue,
    ProductVariant,
    ProductVariantImage,
    ProductVariantValue
}
