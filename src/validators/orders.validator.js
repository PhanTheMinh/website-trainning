const Joi = require('joi')

const createOrderSchema = Joi.object({
    checkout_token: Joi.string().guid({ version: 'uuidv4' }).required(),
    request_id: Joi.string().guid({ version: 'uuidv4' }).required(),
    version: Joi.number().integer().positive().required()
}).options({ abortEarly: false })
const idSchema = Joi.number().integer().positive().max(Number.MAX_SAFE_INTEGER).required()
const listSellerOrdersSchema = Joi.object({
    page: Joi.number().integer().min(1).max(1000000).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    q: Joi.string().trim().max(100).allow('').default(''),
    order_status: Joi.string().valid('all', 'pending', 'confirmed', 'completed', 'cancelled').default('all'),
    financial_status: Joi.string().valid('all', 'unpaid', 'paid').default('all'),
    fulfillment_status: Joi.string().valid('all', 'unfulfilled', 'processing', 'shipped', 'delivered', 'cancelled').default('all'),
    sort: Joi.string().valid('newest', 'oldest', 'total_desc', 'total_asc').default('newest')
}).options({ abortEarly: false, allowUnknown: false })
const orderActionSchema = Joi.object({
    version: Joi.number().integer().positive().max(4294967294).required()
}).options({ abortEarly: false, allowUnknown: false })
const orderFulfillmentSchema = orderActionSchema.keys({
    fulfillment_status: Joi.string().valid('processing', 'shipped', 'delivered').required()
})
const cancelOrderSchema = orderActionSchema.keys({ reason: Joi.string().trim().min(3).max(500).required() })
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

module.exports = { createOrderSchema, idSchema, finalAddressSchema, listSellerOrdersSchema,
    orderActionSchema, orderFulfillmentSchema, cancelOrderSchema }
