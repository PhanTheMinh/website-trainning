const service = require('../services/orders.service')
const { createOrderSchema, idSchema } = require('../validators/orders.validator')
const { tokenSchema } = require('../validators/checkout.validator')
function validate(schema, data) {
    const { value, error } = schema.validate(data)
    if (error) throw Object.assign(new Error(error.details.map(detail => detail.message).join('; ')), { statusCode: 400 })
    return value
}
exports.create = async (req, res) => res.status(201).json({ success: true,
    data: await service.createOrder(req.user.id, validate(createOrderSchema, req.body)) })
exports.get = async (req, res) => res.json({ success: true,
    data: await service.getOrder(req.user.id, validate(idSchema, req.params.id)) })
exports.getCheckoutOrders = async (req, res) => res.json({ success: true,
    data: await service.getCheckoutOrders(req.user.id, validate(tokenSchema, req.params.token)) })
