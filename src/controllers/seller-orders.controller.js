const service = require('../services/seller-orders.service')
const { listSellerOrdersSchema, idSchema, orderActionSchema, orderFulfillmentSchema, cancelOrderSchema } = require('../validators/orders.validator')

function validate(schema, input) {
    const { value, error } = schema.validate(input)
    if (error) throw Object.assign(new Error(error.details.map(detail => detail.message).join('; ')), { statusCode: 400 })
    return value
}

exports.list = async (req, res) => {
    const { value, error } = listSellerOrdersSchema.validate(req.query)
    if (error) throw Object.assign(new Error(error.details.map(detail => detail.message).join('; ')), { statusCode: 400 })
    const result = await service.listOrders(req.user.id, value)
    return res.json({ success: true, data: result.items, pagination: result.pagination })
}
exports.get = async (req, res) => res.json({ success: true,
    data: await service.getOrder(req.user.id, validate(idSchema, req.params.id)) })
const change = (action, schema) => async (req, res) => {
    const data = validate(schema, req.body)
    return res.json({ success: true, data: await service.changeOrder(req.user.id,
        validate(idSchema, req.params.id), action || data.fulfillment_status, data) })
}
exports.confirm = change('confirm', orderActionSchema)
exports.fulfillment = change(null, orderFulfillmentSchema)
exports.cancel = change('cancel', cancelOrderSchema)
exports.markPaid = change('mark-paid', orderActionSchema)
