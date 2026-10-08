const Joi = require('joi')

const createShippingMethodSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    description: Joi.string().trim().max(255).allow('', null).default(null),
    status: Joi.string().valid('active', 'inactive').default('active')
})
    .options({
        abortEarly: false,
        stripUnknown: false
    })

const updateShippingMethodStatusSchema = Joi.object({
    status: Joi.string().valid('active', 'inactive').required()
})
    .options({
        abortEarly: false,
        stripUnknown: false
    })

const listShippingMethodsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(8),
    q: Joi.string().trim().max(100).allow('').default(''),
    status: Joi.string().valid('all', 'active', 'inactive').default('all'),
    sort: Joi.string()
        .valid('name_asc', 'name_desc', 'active_first', 'newest')
        .default('name_asc')
})
    .options({
        abortEarly: false,
        stripUnknown: false
    })

module.exports = {
    createShippingMethodSchema,
    listShippingMethodsQuerySchema,
    updateShippingMethodStatusSchema
}
