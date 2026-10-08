const Joi = require('joi')

const createCountrySchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    country_code: Joi.string().trim().uppercase().pattern(/^[A-Z]{2}$/).required(),
    phone_code: Joi.string().trim().pattern(/^\+[1-9]\d{0,6}$/).required()
})
    .options({ abortEarly: false, stripUnknown: false })

const listCountriesQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(8),
    q: Joi.string().trim().max(100).allow('').default('')
})
    .options({ abortEarly: false, stripUnknown: false })

const createShippingRateSchema = Joi.object({
    shipping_method_id: Joi.number().integer().positive().required(),
    country_ids: Joi.array()
        .items(Joi.number().integer().positive())
        .min(1)
        .unique()
        .required(),
    min_delivery_days: Joi.number().integer().min(0).max(365).required(),
    max_delivery_days: Joi.number()
        .integer()
        .min(Joi.ref('min_delivery_days'))
        .max(365)
        .required(),
    fixed_fee: Joi.number().precision(2).min(0).max(9999999999.99).required()
})
    .options({ abortEarly: false, stripUnknown: false })

const listShippingRatesQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(8),
    q: Joi.string().trim().max(100).allow('').default('')
})
    .options({ abortEarly: false, stripUnknown: false })

const updateShippingRateSchema = createShippingRateSchema

module.exports = {
    createCountrySchema,
    listCountriesQuerySchema,
    createShippingRateSchema,
    listShippingRatesQuerySchema,
    updateShippingRateSchema
}
