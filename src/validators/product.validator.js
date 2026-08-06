const Joi = require('joi')
const {
    productCategoryValues
} = require('../config/product-categories')

const variantSchema = Joi.array()
    .items(Joi.string().trim().min(1).max(50))
    .unique()
    .max(20)
    .default([])

const createProductSchema = Joi.object({
    title: Joi.string().trim().min(3).max(180).required(),
    description: Joi.string().trim().min(10).max(5000).required(),
    category: Joi.string()
        .trim()
        .valid(...productCategoryValues)
        .required(),
    price: Joi.number()
        .positive()
        .precision(2)
        .max(9999999999.99)
        .required(),
    stock: Joi.number()
        .integer()
        .min(0)
        .max(1000000000)
        .required(),
    weight_grams: Joi.number()
        .integer()
        .min(1)
        .max(10000000)
        .allow(null)
        .default(null),
    sizes: variantSchema,
    colors: variantSchema
})
    .options({
        abortEarly: false,
        stripUnknown: false
    })
    .messages({
        'any.required': '{#label} is required',
        'object.unknown': '{#label} is not allowed',
        'number.base': '{#label} must be a valid number',
        'number.positive': '{#label} must be greater than 0',
        'number.integer': '{#label} must be an integer',
        'number.min': '{#label} must be at least {#limit}',
        'string.empty': '{#label} is required',
        'string.min': '{#label} must contain at least {#limit} characters',
        'string.max': '{#label} must not exceed {#limit} characters',
        'array.unique': '{#label} contains duplicate values',
        'array.max': '{#label} must not contain more than {#limit} values'
    })

const listProductsQuerySchema = Joi.object({
    category: Joi.string()
        .trim()
        .valid(...productCategoryValues)
        .optional()
})
    .options({
        abortEarly: false,
        stripUnknown: false
    })
    .messages({
        'any.only': '{#label} must be a supported product category',
        'object.unknown': '{#label} is not allowed'
    })

module.exports = {
    createProductSchema,
    listProductsQuerySchema
}
