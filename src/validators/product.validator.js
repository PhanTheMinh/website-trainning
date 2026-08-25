const Joi = require('joi')
const {
    productCategoryValues
} = require('../config/product-categories')
const {
    bulkUpdatableProductStatuses,
    productStatusValues
} = require('../config/product-statuses')

const optionCodeSchema = Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z][a-z0-9-]{0,49}$/)

const productOptionSchema = Joi.object({
    code: optionCodeSchema.required(),
    name: Joi.string().trim().min(1).max(80).required(),
    values: Joi.array()
        .items(Joi.string().trim().min(1).max(80))
        .unique()
        .min(1)
        .max(20)
        .required()
})

const productVariantSchema = Joi.object({
    sku: Joi.string().trim().max(64).allow('', null).default(null),
    option_values: Joi.object()
        .pattern(optionCodeSchema, Joi.string().trim().min(1).max(80))
        .default({}),
    price: Joi.number()
        .positive()
        .precision(2)
        .max(9999999999.99)
        .allow(null)
        .default(null),
    stock_quantity: Joi.number()
        .integer()
        .min(0)
        .max(1000000000)
        .required(),
    image_index: Joi.number()
        .integer()
        .min(0)
        .max(11)
        .allow(null)
        .default(null),
    images: Joi.array()
        .items(Joi.string().pattern(/^(?:existing|new):\d+$/))
        .unique()
        .max(8)
        .default([]),
    status: Joi.string()
        .valid('active', 'inactive')
        .default('active')
})

const createProductSchema = Joi.object({
    title: Joi.string().trim().min(3).max(180).required(),
    description: Joi.string().trim().min(10).max(5000).required(),
    category_id: Joi.number().integer().positive().required(),
    brand: Joi.string().trim().max(100).allow('', null).default(null),
    price: Joi.number()
        .positive()
        .precision(2)
        .max(9999999999.99)
        .required(),
    weight_grams: Joi.number()
        .integer()
        .min(1)
        .max(10000000)
        .allow(null)
        .default(null),
    options: Joi.array()
        .items(productOptionSchema)
        .unique('code')
        .max(5)
        .default([]),
    variants: Joi.array()
        .items(productVariantSchema)
        .min(1)
        .max(400)
        .required()
})
    .options({
        abortEarly: false,
        stripUnknown: false
    })

const updateProductSchema = Joi.object({
    title: Joi.string().trim().min(3).max(180),
    description: Joi.string().trim().min(10).max(5000),
    category_id: Joi.number().integer().positive(),
    brand: Joi.string().trim().max(100).allow('', null),
    price: Joi.number()
        .positive()
        .precision(2)
        .max(9999999999.99),
    weight_grams: Joi.number()
        .integer()
        .min(1)
        .max(10000000)
        .allow(null),
    options: Joi.array()
        .items(productOptionSchema)
        .unique('code')
        .max(5),
    variants: Joi.array()
        .items(productVariantSchema)
        .min(1)
        .max(400),
    image_order: Joi.array()
        .items(
            Joi.string().pattern(/^(?:existing|new):\d+$/)
        )
        .unique()
        .max(12),
    updated_at: Joi.date().iso(),
    lock_version: Joi.number().integer().min(0).required()
})
    .and('options', 'variants')
    .with('image_order', ['options', 'variants'])
    .or(
        'title',
        'description',
        'category_id',
        'brand',
        'price',
        'weight_grams',
        'options',
        'variants',
        'image_order'
    )
    .options({
        abortEarly: false,
        stripUnknown: false
    })
    .messages({
        'any.required': '{#label} is required',
        'any.only': '{#label} contains an unsupported value',
        'object.unknown': '{#label} is not allowed',
        'object.and': 'options and variants must be provided together',
        'object.missing': 'At least one editable product field is required',
        'object.with': 'image_order requires options and variants',
        'date.base': '{#label} must be a valid date',
        'date.format': '{#label} must use ISO 8601 format',
        'number.base': '{#label} must be a valid number',
        'number.positive': '{#label} must be greater than 0',
        'number.integer': '{#label} must be an integer',
        'number.min': '{#label} must be at least {#limit}',
        'string.empty': '{#label} is required',
        'string.min': '{#label} must contain at least {#limit} characters',
        'string.max': '{#label} must not exceed {#limit} characters',
        'string.pattern.base': '{#label} has an invalid format',
        'array.unique': '{#label} contains duplicate values',
        'array.min': '{#label} must contain at least {#limit} item',
        'array.max': '{#label} must not contain more than {#limit} items'
    })

const bulkDeleteProductsSchema = Joi.object({
    ids: Joi.array()
        .items(Joi.number().integer().positive())
        .min(1)
        .max(50)
        .required()
})
    .options({
        abortEarly: false,
        stripUnknown: false
    })
    .messages({
        'any.required': '{#label} is required',
        'object.unknown': '{#label} is not allowed',
        'number.base': '{#label} must contain valid product ids',
        'number.integer': '{#label} must contain integer product ids',
        'number.positive': '{#label} must contain positive product ids',
        'array.min': '{#label} must contain at least {#limit} product id',
        'array.max': '{#label} must not contain more than {#limit} product ids'
    })

const bulkUpdateProductStatusSchema = Joi.object({
    ids: Joi.array()
        .items(Joi.number().integer().positive())
        .min(1)
        .max(50)
        .required(),
    status: Joi.string()
        .valid(...bulkUpdatableProductStatuses)
        .required()
})
    .options({
        abortEarly: false,
        stripUnknown: false
    })
    .messages({
        'any.required': '{#label} is required',
        'any.only': '{#label} contains an unsupported product status',
        'object.unknown': '{#label} is not allowed',
        'number.base': '{#label} must contain valid product ids',
        'number.integer': '{#label} must contain integer product ids',
        'number.positive': '{#label} must contain positive product ids',
        'array.min': '{#label} must contain at least {#limit} product id',
        'array.max': '{#label} must not contain more than {#limit} product ids'
    })

const updateVariantStockSchema = Joi.object({
    stock_quantity: Joi.number()
        .integer()
        .min(0)
        .max(1000000000)
        .required()
})
    .options({
        abortEarly: false,
        stripUnknown: false
    })
    .messages({
        'any.required': '{#label} is required',
        'object.unknown': '{#label} is not allowed',
        'number.base': '{#label} must be a valid number',
        'number.integer': '{#label} must be an integer',
        'number.min': '{#label} must be at least {#limit}'
    })

const listProductsQuerySchema = Joi.object({
    category: Joi.string()
        .trim()
        .valid(...productCategoryValues)
        .optional(),
    brand: Joi.string().trim().max(80).optional(),
    search: Joi.string().trim().max(180).allow('').default(''),
    minPrice: Joi.number().min(0).precision(2).optional(),
    maxPrice: Joi.number().min(0).precision(2).optional(),
    sort: Joi.string()
        .valid('name-asc', 'name-desc', 'featured', 'price-asc', 'price-desc')
        .default('name-asc'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(20).default(12)
})
    .custom((value, helpers) => {
        if (value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice) {
            return helpers.error('any.invalid')
        }

        return value
    })
    .options({
        abortEarly: false,
        stripUnknown: false
    })
    .messages({
        'any.only': '{#label} must be a supported product category',
        'any.invalid': 'minPrice must not exceed maxPrice',
        'object.unknown': '{#label} is not allowed',
        'number.base': '{#label} must be a valid number',
        'number.integer': '{#label} must be an integer',
        'number.min': '{#label} must be at least {#limit}',
        'number.max': '{#label} must not exceed {#limit}',
        'string.max': '{#label} must not exceed {#limit} characters'
    })

const listOwnProductsQuerySchema = Joi.object({
    search: Joi.string().trim().max(180).allow('').default(''),
    categoryId: Joi.number().integer().positive().optional(),
    status: Joi.string().valid(...productStatusValues).optional(),
    minPrice: Joi.number().min(0).precision(2).optional(),
    maxPrice: Joi.number().min(0).precision(2).optional(),
    sort: Joi.string()
        .valid(
            'name_asc',
            'name_desc',
            'price_asc',
            'price_desc',
            'category_asc'
        )
        .default('name_asc'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10)
})
    .custom((value, helpers) => {
        if (value.minPrice !== undefined && value.maxPrice !== undefined && value.minPrice > value.maxPrice) {
            return helpers.error('any.invalid')
        }

        return value
    })
    .options({
        abortEarly: false,
        stripUnknown: false
    })
    .messages({
        'any.only': '{#label} contains an unsupported value',
        'any.invalid': 'minPrice must not exceed maxPrice',
        'object.unknown': '{#label} is not allowed',
        'number.base': '{#label} must be a valid number',
        'number.integer': '{#label} must be an integer',
        'number.min': '{#label} must be at least {#limit}',
        'number.max': '{#label} must not exceed {#limit}',
        'number.positive': '{#label} must be greater than 0',
        'string.max': '{#label} must not exceed {#limit} characters'
    })

const listDeletedProductsQuerySchema = Joi.object({
    search: Joi.string().trim().max(180).allow('').default(''),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10)
})
    .options({
        abortEarly: false,
        stripUnknown: false
    })
    .messages({
        'object.unknown': '{#label} is not allowed',
        'number.base': '{#label} must be a valid number',
        'number.integer': '{#label} must be an integer',
        'number.min': '{#label} must be at least {#limit}',
        'number.max': '{#label} must not exceed {#limit}',
        'string.max': '{#label} must not exceed {#limit} characters'
    })

module.exports = {
    bulkDeleteProductsSchema,
    bulkUpdateProductStatusSchema,
    createProductSchema,
    listDeletedProductsQuerySchema,
    listOwnProductsQuerySchema,
    listProductsQuerySchema,
    updateProductSchema,
    updateVariantStockSchema
}
