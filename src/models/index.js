const User = require('./user')
const Shop = require('./shop')
const Category = require('./category')
const Product = require('./product')
const ProductImage = require('./product-image')
const ProductOption = require('./product-option')
const ProductOptionValue = require('./product-option-value')
const ProductVariant = require('./product-variant')
const ProductVariantImage = require('./product-variant-image')
const ProductVariantValue = require('./product-variant-value')
const ShippingMethod = require('./shipping-method')
const Country = require('./country')
const ShippingRate = require('./shipping-rate')
const ShippingRateCountry = require('./shipping-rate-country')
const CheckoutToken = require('./checkout-token')
const PaymentMethod = require('./payment-method')

User.hasMany(Product, {
    as: 'products',
    foreignKey: 'owner_id'
})

Product.belongsTo(User, {
    as: 'owner',
    foreignKey: 'owner_id'
})

User.hasOne(Shop, {
    as: 'shop',
    foreignKey: 'owner_user_id'
})

User.hasMany(PaymentMethod, {
    as: 'paymentMethods',
    foreignKey: 'user_id'
})

PaymentMethod.belongsTo(User, {
    as: 'user',
    foreignKey: 'user_id'
})

Shop.belongsTo(User, {
    as: 'owner',
    foreignKey: 'owner_user_id'
})

Shop.hasMany(Product, {
    as: 'products',
    foreignKey: 'shop_id'
})

Product.belongsTo(Shop, {
    as: 'shop',
    foreignKey: 'shop_id'
})

Shop.hasMany(ShippingMethod, {
    as: 'shippingMethods',
    foreignKey: 'shop_id'
})

ShippingMethod.belongsTo(Shop, {
    as: 'shop',
    foreignKey: 'shop_id'
})

Shop.hasMany(Country, {
    as: 'countries',
    foreignKey: 'shop_id'
})

Country.belongsTo(Shop, {
    as: 'shop',
    foreignKey: 'shop_id'
})

ShippingMethod.hasMany(ShippingRate, {
    as: 'rates',
    foreignKey: 'shipping_method_id'
})

ShippingRate.belongsTo(ShippingMethod, {
    as: 'shippingMethod',
    foreignKey: 'shipping_method_id'
})

ShippingRate.belongsToMany(Country, {
    as: 'countries',
    through: ShippingRateCountry,
    foreignKey: 'shipping_rate_id',
    otherKey: 'country_id'
})

Country.belongsToMany(ShippingRate, {
    as: 'shippingRates',
    through: ShippingRateCountry,
    foreignKey: 'country_id',
    otherKey: 'shipping_rate_id'
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
    Shop,
    Category,
    Product,
    ProductImage,
    ProductOption,
    ProductOptionValue,
    ProductVariant,
    ProductVariantImage,
    ProductVariantValue,
    ShippingMethod,
    Country,
    ShippingRate,
    ShippingRateCountry,
    CheckoutToken,
    PaymentMethod
}
