const checkoutService = require('../services/checkout.service')
const { shippingOptionsSchema, createCheckoutSchema, updateCheckoutSchema, tokenSchema, listCheckoutSchema } = require('../validators/checkout.validator')

async function shippingOptions(req, res, next) {
    try {
        const validation = shippingOptionsSchema.validate(req.body)
        if (validation.error) {
            const error = new Error(validation.error.details.map((item) => item.message).join('. '))
            error.statusCode = 400
            throw error
        }
        const result = await checkoutService.getShippingOptions(
            validation.value.shop_ids,
            validation.value.country_code
        )
        return res.status(200).json({
            success: true,
            data: result
        })
    } catch (error) {
        return next(error)
    }
}

function validate(schema, input) {
    const { error, value } = schema.validate(input)
    if (error) throw Object.assign(new Error(error.message), { statusCode: 400 })
    return value
}
async function create(req, res, next) {
    try { return res.status(201).json({ success: true, data: await checkoutService.createCheckout(req.user.id, validate(createCheckoutSchema, req.body)) }) } catch (error) { return next(error) }
}
async function get(req, res, next) {
    try { return res.json({ success: true, data: await checkoutService.getCheckout(req.user.id, validate(tokenSchema, req.params.token)) }) } catch (error) { return next(error) }
}
async function update(req, res, next) {
    try { return res.json({ success: true, data: await checkoutService.updateCheckout(req.user.id, validate(tokenSchema, req.params.token), validate(updateCheckoutSchema, req.body)) }) } catch (error) { return next(error) }
}
async function list(req, res, next) {
    try { return res.json({ success: true, data: await checkoutService.listCheckouts(req.user.id, validate(listCheckoutSchema, req.query)) }) } catch (error) { return next(error) }
}
module.exports = { shippingOptions, create, get, update, list }
