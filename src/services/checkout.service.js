const { Op } = require('sequelize')
const { v4: uuidv4 } = require('uuid')
const {
    Country,
    ShippingMethod,
    ShippingRate,
    Shop,
    CheckoutToken,
    PaymentMethod
} = require('../models')
const { Product, ProductVariant, ProductVariantImage, ProductImage } = require('../models')
const sequelize = require('../config/database')
const { validatePurchaseItems } = require('./products.service')
const { normalizeGeography } = require('../utils/checkout-geography')

function serializeOption(rate) {
    return {
        rate_id: Number(rate.id),
        method_id: Number(rate.shippingMethod.id),
        name: rate.shippingMethod.name,
        min_delivery_days: Number(rate.min_delivery_days),
        max_delivery_days: Number(rate.max_delivery_days),
        fixed_fee: Number(rate.fixed_fee)
    }
}

function serializePaymentOption(method, methodIds) {
    return {
        id: Number(method.id),
        name: method.name,
        type: method.payment_data.type,
        payment_data: {
            type: method.payment_data.type,
            description: method.payment_data.description || null,
            instructions: method.payment_data.instructions || null
        },
        method_ids: methodIds
    }
}

async function getPaymentOptions(shopIds, transaction = null) {
    const shops = await Shop.findAll({
        where: { id: { [Op.in]: shopIds }, status: 'active' },
        attributes: ['id', 'name', 'owner_user_id'],
        order: [['id', 'ASC']],
        transaction
    })
    if (shops.length !== shopIds.length) return []

    const ownerIds = [...new Set(shops.map((shop) => Number(shop.owner_user_id)))]
    const methods = await PaymentMethod.findAll({
        where: {
            user_id: { [Op.in]: ownerIds },
            is_active: true,
            is_deleted: false
        },
        order: [['id', 'ASC']],
        transaction
    })
    const codByOwner = new Map()
    methods.forEach((method) => {
        if (method.payment_data?.type === 'cod' && !codByOwner.has(Number(method.user_id))) {
            codByOwner.set(Number(method.user_id), method)
        }
    })
    const methodIds = {}
    for (const shop of shops) {
        const method = codByOwner.get(Number(shop.owner_user_id))
        if (!method) return []
        methodIds[Number(shop.id)] = Number(method.id)
    }
    if (!shops.length) return []
    const firstMethod = codByOwner.get(Number(shops[0].owner_user_id))
    const option = serializePaymentOption(firstMethod, methodIds)
    option.shop_details = shops.map(shop => {
        const method = codByOwner.get(Number(shop.owner_user_id))
        return { shop_id: Number(shop.id), shop_name: shop.name,
            name: method.name, description: method.payment_data.description || null,
            instructions: method.payment_data.instructions || null }
    })
    if (shops.length > 1) {
        option.name = 'Cash on delivery'
        option.payment_data = { type: 'cod', description: 'Pay in cash when your order arrives.', instructions: null }
    }
    return [option]
}

async function resolvePayment(shopIds, selectedId, transaction, strict = false) {
    const options = await getPaymentOptions(shopIds, transaction)
    if (selectedId === null || selectedId === undefined) {
        return { options, selected: null, issue: null }
    }
    const selected = options.find((option) => option.id === Number(selectedId)) || null
    if (!selected && strict) {
        throw fail('The selected payment method is not available for this checkout', 409, 'PAYMENT_METHOD_UNAVAILABLE')
    }
    return {
        options,
        selected,
        issue: selected ? null : 'The saved payment method is no longer available.'
    }
}

async function getShippingOptions(shopIds, countryCode = null, transaction = null) {
    const shops = await Shop.findAll({
        transaction,
        where: { id: { [Op.in]: shopIds }, status: 'active' },
        attributes: ['id', 'name']
    })
    const activeIds = shops.map((shop) => Number(shop.id))
    const rates = activeIds.length
        ? await ShippingRate.findAll({
            transaction,
            include: [{
                model: ShippingMethod,
                as: 'shippingMethod',
                attributes: ['id', 'name', 'shop_id'],
                where: {
                    shop_id: { [Op.in]: activeIds },
                    status: 'active'
                },
                required: true
            }, {
                model: Country,
                as: 'countries',
                attributes: ['id', 'name', 'country_code', 'phone_code'],
                through: { attributes: [] }
            }]
        })
        : []

    const countriesByShop = new Map(shopIds.map((id) => [Number(id), new Map()]))
    const optionsByShop = new Map(shopIds.map((id) => [Number(id), []]))

    rates.forEach((rate) => {
        const shopId = Number(rate.shippingMethod.shop_id)
        rate.countries.forEach((country) => {
            const code = country.country_code.toUpperCase()
            countriesByShop.get(shopId).set(code, {
                name: country.name,
                country_code: code,
                phone_code: country.phone_code
            })
            if (countryCode && code === countryCode) {
                optionsByShop.get(shopId).push(serializeOption(rate))
            }
        })
    })

    const firstShopCountries = countriesByShop.get(Number(shopIds[0])) || new Map()
    const destinations = [...firstShopCountries.values()]
        .filter((country) => shopIds.every((id) =>
            countriesByShop.get(Number(id))?.has(country.country_code)
        ))
        .sort((left, right) => left.name.localeCompare(right.name, 'vi'))

    const shipping = shopIds.map((id) => {
        const shopId = Number(id)
        const shop = shops.find((entry) => Number(entry.id) === shopId)
        const options = optionsByShop.get(shopId).sort((left, right) =>
            left.fixed_fee - right.fixed_fee ||
            left.max_delivery_days - right.max_delivery_days ||
            left.rate_id - right.rate_id
        )
        return {
            shop_id: shopId,
            shop_name: shop?.name || null,
            options
        }
    })

    return { destinations, shipping }
}

function fail(message, statusCode, publicCode) {
    return Object.assign(new Error(message), { statusCode, publicCode })
}
function parse(value, fallback = {}) {
    if (value && typeof value === 'object') return value
    try { return JSON.parse(value) || fallback } catch { return fallback }
}
function cents(value) {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value))
    const result = match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : NaN
    if (!Number.isSafeInteger(result)) throw fail('Invalid monetary amount', 409, 'INVALID_PRICE')
    return result
}
async function calculate(items, address, selections, transaction, strict = false) {
    let validated
    try {
        if (!items.length) throw fail('This older checkout has no saved products. Please start again from your cart.', 409, 'MISSING_ITEMS')
        validated = await validatePurchaseItems(items, transaction)
    } catch (error) {
        if (strict || !error.statusCode || error.statusCode >= 500) throw error
        return { items, destinations: [], shipping: [], issues: [error.message],
            total: { subtotal: null, shipping_fee: null, amount_due: null } }
    }
    const snapshots = []
    let subtotal = 0
    for (const item of validated) {
        const product = await Product.findByPk(item.product_id, { transaction })
        const variant = await ProductVariant.findByPk(item.variant_id, { transaction })
        const variantImages = await ProductVariantImage.findAll({ where: { product_variant_id: item.variant_id }, order: [['sort_order', 'ASC'], ['id', 'ASC']], transaction })
        const productImages = await ProductImage.findAll({ where: { product_id: item.product_id }, order: [['sort_order', 'ASC'], ['id', 'ASC']], transaction })
        const imageUrls = [...new Set([...variantImages.map(image => image.image_url), variant.image_url,
            ...productImages.map(image => image.image_url)].filter(Boolean))]
        const line = cents(variant.price) * item.quantity
        subtotal += line
        if (!Number.isSafeInteger(subtotal)) throw fail('Total is too large', 400, 'INVALID_TOTAL')
        snapshots.push({ ...item, key: `${item.product_id}:${item.variant_id}`, name: product.title,
            category: product.category, image_url: imageUrls[0] || null, image_urls: imageUrls,
            price: Number(variant.price), line_total: line / 100 })
    }
    const shopIds = [...new Set(snapshots.map(item => item.shop_id))]
    if (shopIds.length > 20) throw fail('At most 20 shops per checkout', 400, 'TOO_MANY_SHOPS')
    const options = await getShippingOptions(shopIds, address.country_code || null, transaction)
    const issues = []
    let shippingFee = 0
    const shipping = options.shipping.map(group => {
        const selected = group.options.find(option => option.rate_id === selections[group.shop_id]) || null
        if (!selected) issues.push(`Choose an available shipping method for ${group.shop_name || group.shop_id}.`)
        else shippingFee += cents(selected.fixed_fee)
        return { ...group, selected }
    })
    if (!Number.isSafeInteger(subtotal + shippingFee)) throw fail('Total is too large', 400, 'INVALID_TOTAL')
    return { items: snapshots, destinations: options.destinations, shipping, issues,
        total: { subtotal: subtotal / 100, shipping_fee: issues.length ? null : shippingFee / 100,
            amount_due: issues.length ? null : (subtotal + shippingFee) / 100 } }
}
async function owned(userId, token, transaction, lock = false) {
    const draft = await CheckoutToken.findOne({ where: { checkout_token: token, user_id: userId },
        transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) })
    if (!draft) throw fail('Checkout not found', 404, 'CHECKOUT_NOT_FOUND')
    return draft
}
function serialize(draft, calculation, payment) {
    return { token: draft.checkout_token, version: draft.version, is_completed: draft.is_completed,
        updated_at: draft.updatedAt, shipping_address: normalizeGeography(parse(draft.shipping_address)),
        shipping_selections: parse(draft.shipping_method).selected_rates || {},
        payment_options: payment.options,
        payment_selection: payment.selected,
        payment_issue: payment.issue,
        ...calculation }
}
async function read(draft, transaction) {
    const calculation = await calculate(parse(draft.items, []), parse(draft.shipping_address),
        parse(draft.shipping_method).selected_rates || {}, transaction)
    const payment = await resolvePayment(
        [...new Set(calculation.items.map((item) => item.shop_id))],
        parse(draft.payment_method, null)?.id,
        transaction
    )
    return serialize(draft, calculation, payment)
}
async function getCheckout(userId, token) {
    return sequelize.transaction(async transaction => read(await owned(userId, token, transaction), transaction))
}
async function createCheckout(userId, data) {
    try {
        return await sequelize.transaction(async transaction => {
            const existing = await CheckoutToken.findOne({ where: { user_id: userId, request_id: data.request_id }, transaction })
            if (existing) return read(existing, transaction)
            const calculation = await calculate(data.items, {}, {}, transaction, true)
            const payment = await resolvePayment(
                [...new Set(calculation.items.map((item) => item.shop_id))],
                null,
                transaction
            )
            const draft = await CheckoutToken.create({ user_id: userId, request_id: data.request_id,
                checkout_token: uuidv4(), shop_used_id: calculation.items[0].shop_id, is_completed: false,
                items: calculation.items, version: 1, shipping_address: '{}',
                shipping_method: '{"selected_rates":{}}', payment_method: null,
                total: JSON.stringify(calculation.total) }, { transaction })
            return serialize(draft, calculation, payment)
        })
    } catch (error) {
        if (error.name !== 'SequelizeUniqueConstraintError') throw error
        const existing = await CheckoutToken.findOne({ where: { user_id: userId, request_id: data.request_id } })
        if (!existing) throw error
        return getCheckout(userId, existing.checkout_token)
    }
}
async function updateCheckout(userId, token, data) {
    return sequelize.transaction(async transaction => {
        const draft = await owned(userId, token, transaction, true)
        if (draft.is_completed) throw fail('Checkout is completed', 409, 'CHECKOUT_COMPLETED')
        if (draft.version !== data.version) throw fail('Checkout changed in another tab. Reload before editing.', 409, 'CHECKOUT_CONFLICT')
        const address = normalizeGeography({ ...parse(draft.shipping_address), ...data.shipping_address })
        const selections = data.shipping_selections || parse(draft.shipping_method).selected_rates || {}
        const calculation = await calculate(data.items || parse(draft.items, []), address, selections, transaction, Boolean(data.items))
        const selectedId = Object.prototype.hasOwnProperty.call(data, 'payment_method_id')
            ? data.payment_method_id
            : parse(draft.payment_method, null)?.id
        const payment = await resolvePayment(
            [...new Set(calculation.items.map((item) => item.shop_id))],
            selectedId,
            transaction,
            Object.prototype.hasOwnProperty.call(data, 'payment_method_id') && selectedId !== null
        )
        await draft.update({ items: calculation.items, shipping_address: JSON.stringify(address),
            shipping_method: JSON.stringify({ selected_rates: selections }), total: JSON.stringify(calculation.total),
            payment_method: payment.selected,
            version: draft.version + 1 }, { transaction })
        return serialize(draft, calculation, payment)
    })
}
async function listCheckouts(userId, { page, limit }) {
    const result = await CheckoutToken.findAndCountAll({
        where: { user_id: userId, is_completed: false, checkout_token: { [Op.ne]: null } },
        order: [['updated_at', 'DESC'], ['id', 'DESC']], limit, offset: (page - 1) * limit
    })
    return { page, count: result.count, items: result.rows.map(draft => ({ token: draft.checkout_token,
        updated_at: draft.updatedAt, item_count: parse(draft.items, []).reduce((sum, item) => sum + item.quantity, 0) })) }
}
module.exports = {
    getPaymentOptions,
    getShippingOptions,
    createCheckout,
    getCheckout,
    updateCheckout,
    listCheckouts
}
