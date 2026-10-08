const { Op } = require('sequelize')
const sequelize = require('../config/database')
const { PaymentMethod, Shop } = require('../models')

function clientError(message, statusCode = 400) {
    return Object.assign(new Error(message), { statusCode })
}

function normalizeId(value, label) {
    const id = Number(value)
    if (!Number.isSafeInteger(id) || id <= 0) throw clientError(`Invalid ${label}`)
    return id
}

function serialize(method) {
    const value = method.get ? method.get({ plain: true }) : method
    return {
        id: Number(value.id),
        name: value.name,
        payment_data: value.payment_data,
        is_active: Boolean(value.is_active),
        is_deleted: Boolean(value.is_deleted),
        user_id: Number(value.user_id),
        created_at: value.created_at || value.createdAt,
        updated_at: value.updated_at || value.updatedAt
    }
}

async function requireManagedShop(userId, transaction = null) {
    const id = normalizeId(userId, 'user id')
    const shop = await Shop.findOne({
        where: { owner_user_id: id },
        transaction
    })
    if (!shop) throw clientError('Shop not found', 404)
    if (shop.status === 'suspended') {
        throw clientError('Suspended shop cannot manage payment methods', 403)
    }
    return shop
}

async function ownedMethod(userId, methodId, transaction = null, lock = false) {
    const method = await PaymentMethod.findOne({
        where: {
            id: normalizeId(methodId, 'payment method id'),
            user_id: normalizeId(userId, 'user id'),
            is_deleted: false
        },
        transaction,
        ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {})
    })
    if (!method) throw clientError('Payment method not found', 404)
    return method
}

async function listPaymentMethods(userId, options) {
    await requireManagedShop(userId)
    const where = {
        user_id: normalizeId(userId, 'user id'),
        is_deleted: false
    }
    if (options.q) where.name = { [Op.like]: `%${options.q}%` }
    if (options.status !== 'all') where.is_active = options.status === 'active'

    const result = await PaymentMethod.findAndCountAll({
        where,
        order: [['created_at', 'DESC'], ['id', 'DESC']],
        limit: options.limit,
        offset: (options.page - 1) * options.limit
    })
    const totalItems = Number(result.count)
    return {
        items: result.rows.map(serialize),
        pagination: {
            page: options.page,
            limit: options.limit,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / options.limit))
        }
    }
}

async function getPaymentMethod(userId, methodId) {
    await requireManagedShop(userId)
    return serialize(await ownedMethod(userId, methodId))
}

async function createPaymentMethod(userId, data) {
    return sequelize.transaction(async (transaction) => {
        await requireManagedShop(userId, transaction)
        const id = normalizeId(userId, 'user id')
        const methods = await PaymentMethod.findAll({
            where: { user_id: id, is_deleted: false },
            transaction,
            lock: transaction.LOCK.UPDATE
        })
        if (methods.some((method) => method.payment_data?.type === data.payment_data.type)) {
            throw clientError('This payment method already exists', 409)
        }
        const method = await PaymentMethod.create({
            user_id: id,
            name: data.name,
            payment_data: data.payment_data,
            is_active: data.is_active,
            is_deleted: false
        }, { transaction })
        return serialize(method)
    })
}

async function updatePaymentMethod(userId, methodId, data) {
    return sequelize.transaction(async (transaction) => {
        await requireManagedShop(userId, transaction)
        const method = await ownedMethod(userId, methodId, transaction, true)
        await method.update(data, { transaction })
        return serialize(method)
    })
}

async function updatePaymentMethodStatus(userId, methodId, isActive) {
    return updatePaymentMethod(userId, methodId, { is_active: isActive })
}

async function deletePaymentMethod(userId, methodId) {
    return sequelize.transaction(async (transaction) => {
        await requireManagedShop(userId, transaction)
        const method = await ownedMethod(userId, methodId, transaction, true)
        await method.update({ is_deleted: true, is_active: false }, { transaction })
    })
}

module.exports = {
    createPaymentMethod,
    deletePaymentMethod,
    getPaymentMethod,
    listPaymentMethods,
    updatePaymentMethod,
    updatePaymentMethodStatus
}
