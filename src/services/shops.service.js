const sequelize = require('../config/database')
const { Op } = require('sequelize')
const STOREFRONT_ERROR = require('../config/storefront-error-codes')
const { Product, Shop, User } = require('../models')

function createClientError(message, statusCode = 400, publicCode = null) {
    const error = new Error(message)
    error.statusCode = statusCode
    error.publicCode = publicCode
    return error
}

function normalizeId(value, label) {
    const normalizedId = Number(value)

    if (!Number.isSafeInteger(normalizedId) || normalizedId <= 0) {
        throw createClientError(`Invalid ${label}`)
    }

    return normalizedId
}

function slugifyShopName(value) {
    const slug = String(value || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

    return slug.slice(0, 150) || 'shop'
}

async function buildUniqueSlug(name, ownerId, shopId, transaction) {
    const baseSlug = slugifyShopName(name)
    const where = { slug: baseSlug }

    if (shopId) where.id = { [Op.ne]: shopId }

    const existing = await Shop.findOne({
        where,
        attributes: ['id'],
        paranoid: false,
        transaction
    })

    return existing ? `${baseSlug}-${ownerId}` : baseSlug
}

function canonicalIdentifier(shop) {
    return `${shop.id}-${shop.slug}`
}

function serializeShop(shop, options = {}) {
    const value = shop.get ? shop.get({ plain: true }) : shop

    return {
        id: Number(value.id),
        name: value.name,
        slug: value.slug,
        identifier: canonicalIdentifier(value),
        logo_url: value.logo_url || null,
        cover_url: value.cover_url || null,
        description: value.description || null,
        joined_at: value.created_at || value.createdAt,
        ...(options.managed || options.includeStatus
            ? {
                status: value.status
            }
            : {}),
        ...(options.managed
            ? { updated_at: value.updated_at || value.updatedAt }
            : {}),
        ...(options.productCount === undefined
            ? {}
            : { product_count: Number(options.productCount) })
    }
}

async function findOwnerForShop(ownerId, transaction) {
    const normalizedOwnerId = normalizeId(ownerId, 'owner id')
    const owner = await User.findOne({
        where: {
            id: normalizedOwnerId,
            status: 'active'
        },
        attributes: ['id', 'full_name', 'avatar_url'],
        transaction,
        lock: transaction?.LOCK.UPDATE
    })

    if (!owner) {
        throw createClientError('Active shop owner not found', 409)
    }

    return owner
}

async function ensureShopForOwner(ownerId, transaction) {
    const owner = await findOwnerForShop(ownerId, transaction)
    const existing = await Shop.findOne({
        where: { owner_user_id: owner.id },
        paranoid: false,
        transaction,
        lock: transaction?.LOCK.UPDATE
    })

    if (existing) {
        if (existing.deleted_at || existing.status !== 'active') {
            throw createClientError(
                'Shop is not active and cannot list new products',
                409
            )
        }

        return existing
    }

    const name = owner.full_name
    const slug = await buildUniqueSlug(
        name,
        Number(owner.id),
        null,
        transaction
    )

    return Shop.create({
        owner_user_id: owner.id,
        name,
        slug,
        logo_url: owner.avatar_url || null,
        cover_url: null,
        description: null,
        status: 'active'
    }, { transaction })
}

async function createShop(ownerId, shopData) {
    return sequelize.transaction(async (transaction) => {
        const owner = await findOwnerForShop(ownerId, transaction)
        const existing = await Shop.findOne({
            where: { owner_user_id: owner.id },
            paranoid: false,
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (existing) {
            throw createClientError('This account already has a shop', 409)
        }

        const slug = await buildUniqueSlug(
            shopData.name,
            Number(owner.id),
            null,
            transaction
        )

        try {
            const shop = await Shop.create({
                owner_user_id: owner.id,
                name: shopData.name,
                slug,
                logo_url: shopData.logo_url || null,
                cover_url: shopData.cover_url || null,
                description: shopData.description || null,
                status: 'active'
            }, { transaction })

            return serializeShop(shop, { managed: true })
        } catch (error) {
            if (error.name === 'SequelizeUniqueConstraintError') {
                throw createClientError('Shop name or owner is already in use', 409)
            }
            throw error
        }
    })
}

async function getManagedShop(ownerId) {
    const normalizedOwnerId = normalizeId(ownerId, 'owner id')
    const shop = await Shop.findOne({
        where: { owner_user_id: normalizedOwnerId }
    })

    return shop ? serializeShop(shop, { managed: true }) : null
}

async function updateShop(ownerId, shopData) {
    return sequelize.transaction(async (transaction) => {
        const normalizedOwnerId = normalizeId(ownerId, 'owner id')
        const shop = await Shop.findOne({
            where: { owner_user_id: normalizedOwnerId },
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (!shop) throw createClientError('Shop not found', 404)
        if (shop.status === 'suspended') {
            throw createClientError('Suspended shop cannot be edited', 403)
        }

        if (Object.hasOwn(shopData, 'name')) {
            shop.name = shopData.name
            shop.slug = await buildUniqueSlug(
                shopData.name,
                normalizedOwnerId,
                shop.id,
                transaction
            )
        }

        for (const field of ['description', 'logo_url', 'cover_url']) {
            if (Object.hasOwn(shopData, field)) {
                shop[field] = shopData[field] || null
            }
        }

        if (Object.hasOwn(shopData, 'status')) {
            shop.status = shopData.status
        }

        try {
            await shop.save({ transaction })
        } catch (error) {
            if (error.name === 'SequelizeUniqueConstraintError') {
                throw createClientError('Shop name is already in use', 409)
            }
            throw error
        }

        return serializeShop(shop, { managed: true })
    })
}

function parseShopIdentifier(identifier) {
    const match = String(identifier || '').match(/^(\d+)(?:-[a-z0-9-]+)?$/)
    return match ? normalizeId(match[1], 'shop identifier') : null
}

async function getPublicShop(identifier, options = {}) {
    const shopId = parseShopIdentifier(identifier)

    if (!shopId) {
        throw createClientError(
            'Shop not found',
            404,
            STOREFRONT_ERROR.SHOP_NOT_FOUND
        )
    }

    const shop = await Shop.findOne({
        where: {
            id: shopId,
            status: {
                [Op.in]: ['active', 'closed']
            }
        },
        include: [{
            model: User,
            as: 'owner',
            attributes: [],
            where: { status: 'active' },
            required: true
        }]
    })

    if (!shop) {
        throw createClientError(
            'Shop not found',
            404,
            STOREFRONT_ERROR.SHOP_NOT_FOUND
        )
    }

    if (options.requireActive && shop.status !== 'active') {
        throw createClientError(
            'Shop is temporarily closed',
            409,
            STOREFRONT_ERROR.SHOP_CLOSED
        )
    }

    const productCount = shop.status === 'active'
        ? await Product.count({
            where: {
                shop_id: shop.id,
                status: 'active'
            }
        })
        : 0

    return serializeShop(shop, {
        includeStatus: true,
        productCount
    })
}

module.exports = {
    createShop,
    ensureShopForOwner,
    getManagedShop,
    getPublicShop,
    serializeShop,
    updateShop
}
