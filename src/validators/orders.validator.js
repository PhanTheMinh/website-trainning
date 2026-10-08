const Joi = require('joi')

const createOrderSchema = Joi.object({
    checkout_token: Joi.string().guid({ version: 'uuidv4' }).required(),
    request_id: Joi.string().guid({ version: 'uuidv4' }).required(),
    version: Joi.number().integer().positive().required()
}).options({ abortEarly: false })
const idSchema = Joi.number().integer().positive().max(Number.MAX_SAFE_INTEGER).required()
const finalAddressSchema = Joi.object({
    first_name: Joi.string().trim().max(100).required(),
    last_name: Joi.string().trim().max(100).required(),
    email: Joi.string().trim().lowercase().email({ tlds: { allow: false } }).max(254).required(),
    phone: Joi.string().trim().max(30).pattern(/^[+\d][\d ()\-.]{5,29}$/).required(),
    country_code: Joi.string().trim().uppercase().length(2).required(),
    province_state: Joi.string().trim().max(100).allow('').default(''),
    city: Joi.string().trim().max(100).required(),
    street: Joi.string().trim().max(200).allow('').default(''),
    ward: Joi.string().trim().max(100).allow('').default(''),
    house_number: Joi.string().trim().max(50).allow('').default(''),
    apartment: Joi.string().trim().max(100).allow('').default(''),
    zip_code: Joi.string().trim().max(20).allow('').default('')
}).options({ abortEarly: false, stripUnknown: true })

module.exports = { createOrderSchema, idSchema, finalAddressSchema }
