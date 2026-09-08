const Joi = require('joi')
const {
    sellerUpdatableShopStatuses
} = require('../config/shop-statuses')

const shopMediaUrlSchema = Joi.string()
    .trim()
    .max(255)
    .allow('', null)
    .custom((value, helpers) => {
        if (!value || value.startsWith('/uploads/')) return value

        try {
            const url = new URL(value)
            return ['http:', 'https:'].includes(url.protocol)
                ? value
                : helpers.error('string.uri')
        } catch {
            return helpers.error('string.uri')
        }
    })

const shopFields = {
    name: Joi.string().trim().min(2).max(120),
    description: Joi.string().trim().max(2000).allow('', null),
    logo_url: shopMediaUrlSchema,
    cover_url: shopMediaUrlSchema
}

const createShopSchema = Joi.object({
    ...shopFields,
    name: shopFields.name.required()
})
    .options({
        abortEarly: false,
        stripUnknown: false
    })

const updateShopSchema = Joi.object({
    ...shopFields,
    status: Joi.string().valid(...sellerUpdatableShopStatuses)
})
    .min(1)
    .options({
        abortEarly: false,
        stripUnknown: false
    })

module.exports = {
    createShopSchema,
    updateShopSchema
}
