const sequelize = require('../config/database')
const { Op } = require('sequelize')
const { ShippingMethod, Shop } = require('../models')

function createClientError(message, statusCode = 400) {
    const error = new Error(message)
    error.statusCode = statusCode
    return error
}

function normalizeId(value, label) {
    const normalizedId = Number(value)

    if (!Number.isSafeInteger(normalizedId) || normalizedId <= 0) {
        throw createClientError(`Invalid ${label}`)
    }

    return normalizedId
}

function serializeShippingMethod(method) {
    const value = method.get ? method.get({ plain: true }) : method

    return {
        id: Number(value.id),
        name: value.name,
        code: value.code,
        description: value.description || null,
        status: value.status,
        created_at: value.created_at || value.createdAt,
        updated_at: value.updated_at || value.updatedAt
    }
}

function buildMethodCode(name) {
    return String(name)
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50)
}

async function findOwnerShop(ownerId, transaction = null) {
    const normalizedOwnerId = normalizeId(ownerId, 'owner id')
    const shop = await Shop.findOne({
        where: { owner_user_id: normalizedOwnerId },
        transaction,
        lock: transaction?.LOCK.UPDATE
    })

    if (!shop) throw createClientError('Shop not found', 404)
    if (shop.status === 'suspended') {
        throw createClientError('Suspended shop cannot manage shipping methods', 403)
    }

    return shop
}

async function listShippingMethods(ownerId, options = {}) {
    const shop = await findOwnerShop(ownerId)
    const page = Number(options.page) || 1
    const limit = Number(options.limit) || 8
    const where = { shop_id: shop.id }

    if (options.q) where.name = { [Op.like]: `%${options.q}%` }
    if (options.status && options.status !== 'all') where.status = options.status

    const orders = {
        name_asc: [['name', 'ASC']],
        name_desc: [['name', 'DESC']],
        active_first: [['status', 'ASC'], ['name', 'ASC']],
        newest: [['created_at', 'DESC']]
    }
    const result = await ShippingMethod.findAndCountAll({
        where,
        order: orders[options.sort] || orders.name_asc,
        limit,
        offset: (page - 1) * limit
    })

    const totalItems = Number(result.count)
    return {
        items: result.rows.map(serializeShippingMethod),
        pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / limit))
        }
    }
}

async function createShippingMethod(ownerId, methodData) {
    return sequelize.transaction(async (transaction) => {
        const shop = await findOwnerShop(ownerId, transaction)

        try {
            const code = buildMethodCode(methodData.name)

            if (!code) {
                throw createClientError('Shipping method name is invalid')
            }

            const method = await ShippingMethod.create({
                shop_id: shop.id,
                name: methodData.name,
                code,
                description: methodData.description || null,
                status: methodData.status
            }, { transaction })

            return serializeShippingMethod(method)
        } catch (error) {
            if (error.name === 'SequelizeUniqueConstraintError') {
                throw createClientError(
                    'This shipping method already exists for the shop',
                    409
                )
            }
            throw error
        }
    })
}

async function updateShippingMethodStatus(ownerId, methodId, status) {
    return sequelize.transaction(async (transaction) => {
        const shop = await findOwnerShop(ownerId, transaction)
        const normalizedMethodId = normalizeId(methodId, 'shipping method id')
        const method = await ShippingMethod.findOne({
            where: {
                id: normalizedMethodId,
                shop_id: shop.id
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (!method) throw createClientError('Shipping method not found', 404)

        await method.update({ status }, { transaction })
        return serializeShippingMethod(method)
    })
}

module.exports = {
    createShippingMethod,
    listShippingMethods,
    updateShippingMethodStatus
}
