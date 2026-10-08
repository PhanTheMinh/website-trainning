const Joi = require('joi')

const paymentDataSchema = Joi.object({
    type: Joi.string().valid('cod').required(),
    description: Joi.string().trim().max(500).allow('', null).default(null),
    instructions: Joi.string().trim().max(1000).allow('', null).default(null)
})
    .options({ abortEarly: false, stripUnknown: false })

const createPaymentMethodSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100).required(),
    payment_data: paymentDataSchema.required(),
    is_active: Joi.boolean().default(true)
})
    .options({ abortEarly: false, stripUnknown: false })

const updatePaymentMethodSchema = Joi.object({
    name: Joi.string().trim().min(2).max(100),
    payment_data: paymentDataSchema,
    is_active: Joi.boolean()
})
    .min(1)
    .options({ abortEarly: false, stripUnknown: false })

const updatePaymentMethodStatusSchema = Joi.object({
    is_active: Joi.boolean().required()
})
    .options({ abortEarly: false, stripUnknown: false })

const listPaymentMethodsQuerySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(8),
    q: Joi.string().trim().max(100).allow('').default(''),
    status: Joi.string().valid('all', 'active', 'inactive').default('all')
})
    .options({ abortEarly: false, stripUnknown: false })

module.exports = {
    createPaymentMethodSchema,
    listPaymentMethodsQuerySchema,
    updatePaymentMethodSchema,
    updatePaymentMethodStatusSchema
}
