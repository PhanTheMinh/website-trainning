const Joi = require('joi')

const updateProfileSchema = Joi.object({
    full_name: Joi.string().trim().min(2).max(100),
    phone: Joi.string().trim().max(20).allow(null, ''),
    address: Joi.string().trim().max(255).allow(null, '')
}).min(1)

module.exports = {
    updateProfileSchema
}
