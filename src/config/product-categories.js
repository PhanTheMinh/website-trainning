const categoryDefinitions = require('../../shared/product-categories.json')

const productCategories = Object.freeze(
    categoryDefinitions.map((category) => Object.freeze({
        ...category,
        aliases: Object.freeze([...category.aliases])
    }))
)

const productCategoryValues = Object.freeze(
    productCategories.map((category) => category.value)
)

function getProductCategoryByValue(value) {
    return productCategories.find((category) => category.value === value) || null
}

module.exports = {
    getProductCategoryByValue,
    productCategories,
    productCategoryValues
}
