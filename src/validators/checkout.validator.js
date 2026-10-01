const Joi = require('joi')

const shippingOptionsSchema = Joi.object({
    shop_ids: Joi.array()
        .items(Joi.number().integer().positive())
        .unique()
        .min(1)
        .max(20)
        .required(),
    country_code: Joi.string()
        .trim()
        .uppercase()
        .pattern(/^[A-Z]{2}$/)
        .allow(null, '')
        .default(null)
})
    .options({ abortEarly: false, stripUnknown: false })

const itemsSchema = Joi.array().items(Joi.object({
    product_id: Joi.number().integer().positive().required(),
    variant_id: Joi.number().integer().positive().required(),
    quantity: Joi.number().integer().min(1).max(10000).required()
})).min(1).max(100)

// Drafts intentionally allow unfinished email/phone/name fields.
const addressSchema = Joi.object({
    first_name: Joi.string().max(100).allow(''),
    last_name: Joi.string().max(100).allow(''),
    phone: Joi.string().max(30).allow(''),
    email: Joi.string().max(254).allow(''),
    country_code: Joi.string().uppercase().pattern(/^[A-Z]{2}$/).allow(''),
    country_name: Joi.string().max(100).allow(''),
    province_state: Joi.string().max(100).allow(''),
    province_code: Joi.string().max(20).allow(''),
    city: Joi.string().max(100).allow(''),
    zip_code: Joi.string().max(20).allow(''),
    street: Joi.string().max(200).allow(''),
    house_number: Joi.string().max(50).allow(''),
    apartment: Joi.string().max(100).allow(''),
    ward: Joi.string().max(100).allow('')
})
const selectionsSchema = Joi.object().pattern(
    /^[1-9]\d*$/, Joi.number().integer().positive()
).max(20)
const createCheckoutSchema = Joi.object({
    request_id: Joi.string().guid({ version: 'uuidv4' }).required(),
    items: itemsSchema.required()
}).options({ abortEarly: false })
const updateCheckoutSchema = Joi.object({
    version: Joi.number().integer().min(1).required(),
    shipping_address: addressSchema,
    shipping_selections: selectionsSchema,
    payment_method_id: Joi.number().integer().positive().allow(null),
    items: itemsSchema
}).or('shipping_address', 'shipping_selections', 'payment_method_id', 'items').options({ abortEarly: false })
const tokenSchema = Joi.string().guid({ version: 'uuidv4' }).required()
const listCheckoutSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(50).default(10)
})

module.exports = {
    shippingOptionsSchema, createCheckoutSchema, updateCheckoutSchema,
    tokenSchema, listCheckoutSchema
}
