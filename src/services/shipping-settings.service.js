const { Op } = require('sequelize')
const sequelize = require('../config/database')
const {
    Country,
    ShippingMethod,
    ShippingRate,
    ShippingRateCountry,
    Shop,
    Order
} = require('../models')

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

async function findOwnerShop(ownerId, transaction = null) {
    const shop = await Shop.findOne({
        where: { owner_user_id: normalizeId(ownerId, 'owner id') },
        transaction,
        lock: transaction?.LOCK.UPDATE
    })

    if (!shop) throw createClientError('Shop not found', 404)
    if (shop.status === 'suspended') {
        throw createClientError('Suspended shop cannot manage shipping settings', 403)
    }

    return shop
}

function serializeCountry(country) {
    const value = country.get ? country.get({ plain: true }) : country

    return {
        id: Number(value.id),
        name: value.name,
        country_code: value.country_code,
        phone_code: value.phone_code,
        created_at: value.created_at || value.createdAt,
        updated_at: value.updated_at || value.updatedAt
    }
}

function serializeRate(rate) {
    const value = rate.get ? rate.get({ plain: true }) : rate

    return {
        id: Number(value.id),
        shipping_method_id: Number(value.shipping_method_id),
        shipping_method: value.shippingMethod
            ? {
                id: Number(value.shippingMethod.id),
                name: value.shippingMethod.name,
                code: value.shippingMethod.code,
                status: value.shippingMethod.status
            }
            : null,
        min_delivery_days: Number(value.min_delivery_days),
        max_delivery_days: Number(value.max_delivery_days),
        fixed_fee: Number(value.fixed_fee),
        countries: (value.countries || []).map(serializeCountry),
        created_at: value.created_at || value.createdAt,
        updated_at: value.updated_at || value.updatedAt
    }
}

const rateIncludes = [
    {
        model: ShippingMethod,
        as: 'shippingMethod',
        attributes: ['id', 'name', 'code', 'status']
    },
    {
        model: Country,
        as: 'countries',
        attributes: ['id', 'name', 'country_code', 'phone_code'],
        through: { attributes: [] }
    }
]

async function listCountries(ownerId, options = {}) {
    const shop = await findOwnerShop(ownerId)
    const page = Number(options.page) || 1
    const limit = Number(options.limit) || 8
    const where = { shop_id: shop.id }

    if (options.q) where.name = { [Op.like]: `%${options.q}%` }

    const result = await Country.findAndCountAll({
        where,
        order: [['name', 'ASC'], ['id', 'ASC']],
        limit,
        offset: (page - 1) * limit
    })

    const totalItems = Number(result.count)
    return {
        items: result.rows.map(serializeCountry),
        pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / limit))
        }
    }
}

async function createCountry(ownerId, countryData) {
    return sequelize.transaction(async (transaction) => {
        const shop = await findOwnerShop(ownerId, transaction)

        try {
            const country = await Country.create({
                shop_id: shop.id,
                name: countryData.name,
                country_code: countryData.country_code.toUpperCase(),
                phone_code: countryData.phone_code
            }, { transaction })

            return serializeCountry(country)
        } catch (error) {
            if (error.name === 'SequelizeUniqueConstraintError') {
                throw createClientError(
                    'This country name or code already exists for the shop',
                    409
                )
            }
            throw error
        }
    })
}

async function deleteCountry(ownerId, countryId) {
    return sequelize.transaction(async (transaction) => {
        const shop = await findOwnerShop(ownerId, transaction)
        const country = await Country.findOne({
            where: {
                id: normalizeId(countryId, 'country id'),
                shop_id: shop.id
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (!country) throw createClientError('Country not found', 404)

        const isUsed = await ShippingRateCountry.count({
            where: { country_id: country.id },
            transaction
        })

        if (isUsed) {
            throw createClientError(
                'Country is being used by a shipping setting',
                409
            )
        }

        await country.destroy({ transaction })
    })
}

async function listShippingRates(ownerId, options = {}) {
    const shop = await findOwnerShop(ownerId)
    const page = Number(options.page) || 1
    const limit = Number(options.limit) || 8
    const methodWhere = { shop_id: shop.id }

    if (options.q) methodWhere.name = { [Op.like]: `%${options.q}%` }

    const pageResult = await ShippingRate.findAndCountAll({
        attributes: ['id'],
        include: [{
            ...rateIncludes[0],
            attributes: [],
            where: methodWhere,
            required: true
        }],
        order: [
            [{ model: ShippingMethod, as: 'shippingMethod' }, 'name', 'ASC'],
            ['id', 'ASC']
        ],
        limit,
        offset: (page - 1) * limit
    })

    const rateIds = pageResult.rows.map((rate) => rate.id)
    const rows = rateIds.length
        ? await ShippingRate.findAll({
            where: { id: { [Op.in]: rateIds } },
            include: rateIncludes,
            order: [
                [{ model: ShippingMethod, as: 'shippingMethod' }, 'name', 'ASC'],
                ['id', 'ASC']
            ]
        })
        : []
    const totalItems = Number(pageResult.count)
    return {
        items: rows.map(serializeRate),
        pagination: {
            page,
            limit,
            totalItems,
            totalPages: Math.max(1, Math.ceil(totalItems / limit))
        }
    }
}

async function getShippingRate(ownerId, rateId) {
    const shop = await findOwnerShop(ownerId)
    const rate = await ShippingRate.findOne({
        where: { id: normalizeId(rateId, 'shipping rate id') },
        include: [
            {
                ...rateIncludes[0],
                where: { shop_id: shop.id },
                required: true
            },
            rateIncludes[1]
        ]
    })

    if (!rate) throw createClientError('Shipping rate not found', 404)
    return serializeRate(rate)
}

async function createShippingRate(ownerId, rateData) {
    return sequelize.transaction(async (transaction) => {
        const shop = await findOwnerShop(ownerId, transaction)
        const method = await ShippingMethod.findOne({
            where: {
                id: normalizeId(rateData.shipping_method_id, 'shipping method id'),
                shop_id: shop.id
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (!method) throw createClientError('Shipping method not found', 404)

        const countryIds = rateData.country_ids.map((id) => normalizeId(id, 'country id'))
        const countries = await Country.findAll({
            where: {
                id: { [Op.in]: countryIds },
                shop_id: shop.id
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (countries.length !== countryIds.length) {
            throw createClientError('One or more countries were not found', 404)
        }

        const overlappingRate = await ShippingRate.findOne({
            where: { shipping_method_id: method.id },
            include: [{
                model: Country,
                as: 'countries',
                attributes: ['id'],
                where: { id: { [Op.in]: countryIds } },
                through: { attributes: [] },
                required: true
            }],
            transaction
        })

        if (overlappingRate) {
            throw createClientError(
                'A selected country already has a rate for this shipping method',
                409
            )
        }

        const rate = await ShippingRate.create({
            shipping_method_id: method.id,
            min_delivery_days: rateData.min_delivery_days,
            max_delivery_days: rateData.max_delivery_days,
            fixed_fee: rateData.fixed_fee
        }, { transaction })

        await rate.setCountries(countries, { transaction })

        const createdRate = await ShippingRate.findByPk(rate.id, {
            include: rateIncludes,
            transaction
        })

        return serializeRate(createdRate)
    })
}

async function updateShippingRate(ownerId, rateId, rateData) {
    return sequelize.transaction(async (transaction) => {
        const shop = await findOwnerShop(ownerId, transaction)
        const rate = await ShippingRate.findOne({
            where: { id: normalizeId(rateId, 'shipping rate id') },
            include: [{
                model: ShippingMethod,
                as: 'shippingMethod',
                attributes: ['id'],
                where: { shop_id: shop.id },
                required: true
            }],
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (!rate) throw createClientError('Shipping rate not found', 404)

        const method = await ShippingMethod.findOne({
            where: {
                id: normalizeId(rateData.shipping_method_id, 'shipping method id'),
                shop_id: shop.id
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        })
        if (!method) throw createClientError('Shipping method not found', 404)

        const countryIds = rateData.country_ids.map((id) => normalizeId(id, 'country id'))
        const countries = await Country.findAll({
            where: { id: { [Op.in]: countryIds }, shop_id: shop.id },
            transaction,
            lock: transaction.LOCK.UPDATE
        })
        if (countries.length !== countryIds.length) {
            throw createClientError('One or more countries were not found', 404)
        }

        const overlappingRate = await ShippingRate.findOne({
            where: {
                id: { [Op.ne]: rate.id },
                shipping_method_id: method.id
            },
            include: [{
                model: Country,
                as: 'countries',
                attributes: ['id'],
                where: { id: { [Op.in]: countryIds } },
                through: { attributes: [] },
                required: true
            }],
            transaction
        })
        if (overlappingRate) {
            throw createClientError(
                'A selected country already has a rate for this shipping method',
                409
            )
        }

        await rate.update({
            shipping_method_id: method.id,
            min_delivery_days: rateData.min_delivery_days,
            max_delivery_days: rateData.max_delivery_days,
            fixed_fee: rateData.fixed_fee
        }, { transaction })
        await rate.setCountries(countries, { transaction })

        const updatedRate = await ShippingRate.findByPk(rate.id, {
            include: rateIncludes,
            transaction
        })
        return serializeRate(updatedRate)
    })
}

async function deleteShippingRate(ownerId, rateId) {
    return sequelize.transaction(async (transaction) => {
        const shop = await findOwnerShop(ownerId, transaction)
        const rate = await ShippingRate.findOne({
            where: { id: normalizeId(rateId, 'shipping rate id') },
            include: [{
                model: ShippingMethod,
                as: 'shippingMethod',
                attributes: ['id'],
                where: { shop_id: shop.id },
                required: true
            }],
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (!rate) throw createClientError('Shipping rate not found', 404)
        if (await Order.count({ where: { shipping_rate_id: rate.id }, transaction })) {
            throw createClientError('This shipping rate has order history and cannot be deleted. Disable its shipping method instead.', 409)
        }
        await rate.destroy({ transaction })
    })
}

module.exports = {
    createCountry,
    createShippingRate,
    deleteCountry,
    deleteShippingRate,
    getShippingRate,
    listCountries,
    listShippingRates,
    updateShippingRate
}
