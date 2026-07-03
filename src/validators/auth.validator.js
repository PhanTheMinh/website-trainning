const Joi = require('joi')

const registerSchema = Joi.object({
    full_name: Joi.string().min(2).max(100).required(),
    email: Joi.string().email().max(150).required(),
    phone: Joi.string().max(20).allow(null, ''),
    password: Joi.string().min(6).max(255).required()
})

const loginSchema = Joi.object({
    email: Joi.string().email().max(150).required(),
    password: Joi.string().min(6).max(255).required()
})

module.exports = {
    registerSchema,
    loginSchema
}