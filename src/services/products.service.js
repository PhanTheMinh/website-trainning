const sequelize = require('../config/database')
const { Op } = require('sequelize')
const {
    bulkUpdatableProductStatuses
} = require('../config/product-statuses')
const {
    Category,
    Product,
    ProductImage,
    ProductOption,
    ProductOptionValue,
    ProductVariant,
    ProductVariantImage,
    ProductVariantValue,
    User
} = require('../models')

const productInclude = [
    {
        model: User,
        as: 'owner',
        attributes: ['id', 'full_name', 'avatar_url']
    },
    {
        model: ProductImage,
        as: 'images',
        attributes: ['id', 'image_url', 'sort_order']
    },
    {
        model: ProductOption,
        as: 'options',
        attributes: ['id', 'code', 'name', 'sort_order'],
        include: [{
            model: ProductOptionValue,
            as: 'values',
            attributes: ['id', 'value', 'sort_order']
        }]
    },
    {
        model: ProductVariant,
        as: 'variants',
        attributes: [
            'id',
            'product_id',
            'sku',
            'price',
            'image_url',
            'stock_quantity',
            'status',
            'is_default'
        ],
        include: [{
            model: ProductOptionValue,
            as: 'optionValues',
            attributes: ['id', 'product_option_id', 'value'],
            through: {
                attributes: []
            }
        }, {
            model: ProductVariantImage,
            as: 'images',
            attributes: ['id', 'image_url', 'sort_order']
        }]
    }
]

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

function normalizeTextKey(value) {
    return String(value).trim().normalize('NFKC').toLocaleLowerCase('vi')
}

function escapeLikePattern(value) {
    return String(value).replace(/[\\%_]/g, '\\$&')
}

const minimumPriceExpression = sequelize.literal(
    'COALESCE((' +
    'SELECT MIN(COALESCE(product_variant.price, `Product`.`price`)) ' +
    'FROM product_variants AS product_variant ' +
    'WHERE product_variant.product_id = `Product`.`id` ' +
    "AND product_variant.status = 'active'" +
    '), `Product`.`price`)'
)

const maximumPriceExpression = sequelize.literal(
    'COALESCE((' +
    'SELECT MAX(COALESCE(product_variant.price, `Product`.`price`)) ' +
    'FROM product_variants AS product_variant ' +
    'WHERE product_variant.product_id = `Product`.`id` ' +
    "AND product_variant.status = 'active'" +
    '), `Product`.`price`)'
)

const totalStockExpression = sequelize.literal(
    'COALESCE((' +
    'SELECT SUM(product_variant.stock_quantity) ' +
    'FROM product_variants AS product_variant ' +
    'WHERE product_variant.product_id = `Product`.`id` ' +
    "AND product_variant.status = 'active'" +
    '), 0)'
)

const primaryImageExpression = sequelize.literal(
    'COALESCE((' +
    'SELECT product_image.image_url ' +
    'FROM product_images AS product_image ' +
    'WHERE product_image.product_id = `Product`.`id` ' +
    'ORDER BY product_image.sort_order ASC, product_image.id ASC ' +
    'LIMIT 1' +
    '), (' +
    'SELECT variant_image.image_url ' +
    'FROM product_variant_images AS variant_image ' +
    'INNER JOIN product_variants AS product_variant ' +
    'ON product_variant.id = variant_image.product_variant_id ' +
    'WHERE product_variant.product_id = `Product`.`id` ' +
    "AND product_variant.status = 'active' " +
    'ORDER BY product_variant.is_default DESC, product_variant.id ASC, ' +
    'variant_image.sort_order ASC, variant_image.id ASC ' +
    'LIMIT 1' +
    '))'
)

function buildOwnProductsOrder(sort) {
    const stableNameOrder = [
        ['title', 'ASC'],
        ['id', 'ASC']
    ]

    if (sort === 'name_desc') {
        return [
            ['title', 'DESC'],
            ['id', 'ASC']
        ]
    }

    if (sort === 'price_asc' || sort === 'price_desc') {
        return [
            [minimumPriceExpression, sort === 'price_asc' ? 'ASC' : 'DESC'],
            ...stableNameOrder
        ]
    }

    if (sort === 'category_asc') {
        return [
            [
                sequelize.literal(
                    'CASE WHEN `Product`.`category_id` IS NULL ' +
                    'THEN 1 ELSE 0 END'
                ),
                'ASC'
            ],
            [
                { model: Category, as: 'categoryDetails' },
                'name',
                'ASC'
            ],
            ...stableNameOrder
        ]
    }

    return stableNameOrder
}

function serializeOwnProduct(product) {
    const value = product.get({ plain: true })
    const category = value.categoryDetails
        ? {
            id: value.categoryDetails.id,
            name: value.categoryDetails.name,
            slug: value.categoryDetails.slug,
            accent: value.categoryDetails.accent
        }
        : null

    return {
        id: value.id,
        title: value.title,
        image_url: value.primary_image_url || null,
        category,
        min_price: Number(value.min_price),
        max_price: Number(value.max_price),
        stock: Number(value.total_stock),
        status: value.status,
        created_at: value.created_at || value.createdAt,
        updated_at: value.updated_at || value.updatedAt
    }
}

function serializeDeletedProduct(product) {
    return {
        ...serializeOwnProduct(product),
        deleted_at: product.get('deleted_at') || product.get('deletedAt')
    }
}

function normalizeOptionCode(value) {
    return String(value)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

function normalizeSku(value) {
    const normalized = String(value || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')

    return normalized.slice(0, 64)
}

function prepareProductConfiguration(
    productData,
    imageUrls,
    variantImageContext = {}
) {
    const newVariantImageUrls = variantImageContext.newImageUrls || []
    const existingVariantImages = variantImageContext.existingImages || new Map()
    const referencedNewVariantImages = new Set()
    const referencedExistingVariantImages = new Set()
    const options = productData.options.map((option, optionIndex) => ({
        code: normalizeOptionCode(option.code),
        name: option.name.trim(),
        sort_order: optionIndex,
        values: option.values.map((value, valueIndex) => ({
            value: value.trim(),
            valueKey: normalizeTextKey(value),
            sort_order: valueIndex
        }))
    }))
    const optionCodes = new Set()

    for (const option of options) {
        if (!option.code || optionCodes.has(option.code)) {
            throw createClientError('Product option codes must be unique')
        }

        optionCodes.add(option.code)
        const valueKeys = new Set()

        for (const optionValue of option.values) {
            if (valueKeys.has(optionValue.valueKey)) {
                throw createClientError(
                    `Option ${option.name} contains duplicate values`
                )
            }
            valueKeys.add(optionValue.valueKey)
        }
    }

    if (!options.length && productData.variants.length !== 1) {
        throw createClientError(
            'A product without options must have exactly one default variant'
        )
    }

    const combinationKeys = new Set()
    const providedSkus = new Set()
    const variants = productData.variants.map((variant) => {
        const selectedValues = {}

        for (const [rawCode, rawValue] of Object.entries(
            variant.option_values || {}
        )) {
            const code = normalizeOptionCode(rawCode)
            selectedValues[code] = String(rawValue).trim()
        }

        const selectedCodes = Object.keys(selectedValues).sort()
        const expectedCodes = Array.from(optionCodes).sort()

        if (
            selectedCodes.length !== expectedCodes.length ||
            selectedCodes.some((code, index) => code !== expectedCodes[index])
        ) {
            throw createClientError(
                'Each variant must select one value from every product option'
            )
        }

        for (const option of options) {
            const selectedValueKey = normalizeTextKey(
                selectedValues[option.code]
            )
            const exists = option.values.some(
                (optionValue) => optionValue.valueKey === selectedValueKey
            )

            if (!exists) {
                throw createClientError(
                    `Variant contains an invalid value for ${option.name}`
                )
            }
        }

        const combinationKey = options.length
            ? options
                .map((option) => `${option.code}:${normalizeTextKey(
                    selectedValues[option.code]
                )}`)
                .sort()
                .join('|')
            : 'default'

        if (combinationKeys.has(combinationKey)) {
            throw createClientError('Product contains duplicate variants')
        }
        combinationKeys.add(combinationKey)

        const sku = variant.sku ? normalizeSku(variant.sku) : null

        if (variant.sku && sku.length < 3) {
            throw createClientError('SKU must contain at least 3 valid characters')
        }

        if (sku && providedSkus.has(sku)) {
            throw createClientError('Product contains duplicate SKUs')
        }

        if (sku) {
            providedSkus.add(sku)
        }

        if (
            variant.image_index !== null &&
            variant.image_index >= imageUrls.length
        ) {
            throw createClientError('Variant image does not exist')
        }

        const variantImageUrls = (variant.images || []).map((token) => {
            const [source, rawId] = token.split(':')

            if (source === 'existing') {
                const existingImage = existingVariantImages.get(String(rawId))

                if (!existingImage) {
                    throw createClientError(
                        'An existing variant image does not belong to this product'
                    )
                }
                if (referencedExistingVariantImages.has(String(rawId))) {
                    throw createClientError(
                        'A variant image can belong to only one variant'
                    )
                }

                referencedExistingVariantImages.add(String(rawId))
                return existingImage.image_url
            }

            const newImageIndex = Number(rawId)

            if (
                !Number.isInteger(newImageIndex) ||
                newImageIndex < 0 ||
                newImageIndex >= newVariantImageUrls.length
            ) {
                throw createClientError('A new variant image does not exist')
            }
            if (referencedNewVariantImages.has(newImageIndex)) {
                throw createClientError(
                    'A variant image can belong to only one variant'
                )
            }

            referencedNewVariantImages.add(newImageIndex)
            return newVariantImageUrls[newImageIndex]
        })

        return {
            ...variant,
            sku,
            option_values: selectedValues,
            combinationKey,
            is_default: options.length === 0,
            image_urls: variantImageUrls
        }
    })

    if (referencedNewVariantImages.size !== newVariantImageUrls.length) {
        throw createClientError(
            'Every uploaded variant image must be assigned to a variant'
        )
    }

    if (!variants.some((variant) => variant.status === 'active')) {
        throw createClientError(
            'A sellable product must have at least one active variant'
        )
    }

    if (
        !imageUrls.length &&
        variants.every((variant) => !variant.image_urls.length)
    ) {
        throw createClientError(
            'A product needs at least one product or variant image'
        )
    }

    return {
        options,
        variants,
        referencedExistingVariantImages
    }
}

function buildGeneratedSku(title, productId, variant, index) {
    const titlePart = normalizeSku(title).slice(0, 28) || 'PRODUCT'
    const optionPart = normalizeSku(
        Object.values(variant.option_values).join('-')
    ).slice(0, 20)
    const suffix = [`P${productId}`, optionPart, String(index + 1)]
        .filter(Boolean)
        .join('-')

    return `${titlePart}-${suffix}`.slice(0, 64)
}

async function persistProductConfiguration(
    product,
    productData,
    imageUrls,
    configuration,
    transaction
) {
    const optionValueMap = new Map()

    for (const optionData of configuration.options) {
        const option = await ProductOption.create(
            {
                product_id: product.id,
                code: optionData.code,
                name: optionData.name,
                sort_order: optionData.sort_order
            },
            { transaction }
        )

        for (const optionValueData of optionData.values) {
            const optionValue = await ProductOptionValue.create(
                {
                    product_option_id: option.id,
                    value: optionValueData.value,
                    sort_order: optionValueData.sort_order
                },
                { transaction }
            )

            optionValueMap.set(
                `${optionData.code}:${optionValueData.valueKey}`,
                optionValue
            )
        }
    }

    const usedSkus = new Set()

    for (let index = 0; index < configuration.variants.length; index += 1) {
        const variantData = configuration.variants[index]
        const optionValues = configuration.options.map((option) =>
            optionValueMap.get(
                `${option.code}:${normalizeTextKey(
                    variantData.option_values[option.code]
                )}`
            )
        )
        const variantKey = optionValues.length
            ? optionValues
                .map((optionValue) => Number(optionValue.id))
                .sort((left, right) => left - right)
                .join('-')
            : 'default'
        const sku = variantData.sku || buildGeneratedSku(
            productData.title,
            product.id,
            variantData,
            index
        )

        if (usedSkus.has(sku)) {
            throw createClientError(
                'Generated SKUs are not unique; enter a custom SKU'
            )
        }
        usedSkus.add(sku)

        const variant = await ProductVariant.create(
            {
                product_id: product.id,
                sku,
                variant_key: variantKey,
                price: variantData.price,
                image_url: variantData.image_urls[0] || (
                    variantData.image_index === null
                        ? null
                        : imageUrls[variantData.image_index]
                ),
                stock_quantity: variantData.stock_quantity,
                status: variantData.status,
                is_default: variantData.is_default
            },
            { transaction }
        )

        if (variantData.image_urls.length) {
            await ProductVariantImage.bulkCreate(
                variantData.image_urls.map((imageUrl, imageIndex) => ({
                    product_variant_id: variant.id,
                    image_url: imageUrl,
                    sort_order: imageIndex
                })),
                { transaction }
            )
        }

        if (optionValues.length) {
            await ProductVariantValue.bulkCreate(
                optionValues.map((optionValue) => ({
                    product_variant_id: variant.id,
                    product_option_value_id: optionValue.id
                })),
                { transaction }
            )
        }
    }
}

function serializeProduct(product, { storefront = false } = {}) {
    const value = product.get({ plain: true })
    const options = (value.options || [])
        .sort((left, right) => left.sort_order - right.sort_order)
        .map((option) => ({
            ...option,
            values: (option.values || [])
                .sort((left, right) => left.sort_order - right.sort_order)
        }))
    const optionById = new Map(
        options.map((option) => [String(option.id), option])
    )
    const variants = (value.variants || []).map((variant) => ({
        ...variant,
        images: (variant.images || []).sort(
            (left, right) => left.sort_order - right.sort_order
        ),
        price: variant.price === null ? null : Number(variant.price),
        effective_price: variant.price === null
            ? Number(value.price)
            : Number(variant.price),
        stock_quantity: Number(variant.stock_quantity),
        option_values: (variant.optionValues || [])
            .map((optionValue) => {
                const option = optionById.get(
                    String(optionValue.product_option_id)
                )

                return {
                    option_id: optionValue.product_option_id,
                    option_code: option?.code,
                    option_name: option?.name,
                    value_id: optionValue.id,
                    value: optionValue.value
                }
            })
            .sort((left, right) => {
                const leftOption = optionById.get(String(left.option_id))
                const rightOption = optionById.get(String(right.option_id))
                return (leftOption?.sort_order || 0) -
                    (rightOption?.sort_order || 0)
            }),
        optionValues: undefined
    }))
    const activeVariants = variants.filter(
        (variant) => variant.status === 'active'
    )
    const prices = activeVariants.map((variant) => variant.effective_price)
    const totalStock = activeVariants.reduce(
        (total, variant) => total + variant.stock_quantity,
        0
    )

    const productImages = (value.images || []).sort(
        (left, right) => left.sort_order - right.sort_order
    )
    const seenGalleryUrls = new Set()
    const galleryImages = [
        ...productImages.map((image) => ({
            ...image,
            source: 'product',
            variant_id: null
        })),
        ...variants.flatMap((variant) => variant.images.map((image) => ({
            ...image,
            source: 'variant',
            variant_id: variant.id
        })))
    ].filter((image) => {
        if (seenGalleryUrls.has(image.image_url)) {
            return false
        }
        seenGalleryUrls.add(image.image_url)
        return true
    })

    return {
        ...value,
        created_at: value.created_at || value.createdAt,
        updated_at: value.updated_at || value.updatedAt,
        deleted_at: value.deleted_at || value.deletedAt || null,
        price: Number(value.price),
        stock: totalStock,
        available: totalStock > 0,
        min_price: prices.length ? Math.min(...prices) : Number(value.price),
        max_price: prices.length ? Math.max(...prices) : Number(value.price),
        sizes: options.find((option) => option.code === 'size')
            ?.values.map((optionValue) => optionValue.value) || [],
        colors: options.find((option) => option.code === 'color')
            ?.values.map((optionValue) => optionValue.value) || [],
        images: productImages,
        gallery_images: galleryImages,
        options,
        variants: storefront ? activeVariants : variants
    }
}

async function findActiveProduct(productId, transaction) {
    const id = normalizeId(productId, 'product id')
    return Product.findOne({
        where: {
            id,
            status: 'active'
        },
        include: productInclude,
        transaction
    })
}

async function getProductById(productId) {
    const product = await findActiveProduct(productId)

    if (!product) {
        throw createClientError('Product not found', 404)
    }

    return serializeProduct(product, { storefront: true })
}

async function listProducts(filters = {}) {
    const page = filters.page || 1
    const limit = filters.limit || 12
    const where = {
        status: 'active'
    }

    if (filters.category) {
        where.category = filters.category
    }

    if (filters.brand) {
        const normalizedBrand = String(filters.brand)
            .trim()
            .toLocaleLowerCase('vi')
            .replace(/\s+/g, '')
        where[Op.and] = [
            sequelize.where(
                sequelize.fn(
                    'LOWER',
                    sequelize.fn('REPLACE', sequelize.col('brand'), ' ', '')
                ),
                normalizedBrand
            )
        ]
    }

    if (filters.search) {
        const searchPattern = `%${escapeLikePattern(filters.search)}%`
        const searchCondition = {
            [Op.or]: [
                { title: { [Op.like]: searchPattern } },
                { brand: { [Op.like]: searchPattern } }
            ]
        }
        where[Op.and] = [...(where[Op.and] || []), searchCondition]
    }

    const priceConditions = []

    if (filters.minPrice !== undefined) {
        priceConditions.push(sequelize.where(maximumPriceExpression, {
            [Op.gte]: filters.minPrice
        }))
    }

    if (filters.maxPrice !== undefined) {
        priceConditions.push(sequelize.where(minimumPriceExpression, {
            [Op.lte]: filters.maxPrice
        }))
    }

    if (priceConditions.length) {
        where[Op.and] = [...(where[Op.and] || []), ...priceConditions]
    }

    const stableNameOrder = [['title', 'ASC'], ['id', 'ASC']]
    let order = stableNameOrder

    if (filters.sort === 'name-desc') {
        order = [['title', 'DESC'], ['id', 'ASC']]
    } else if (filters.sort === 'price-asc' || filters.sort === 'price-desc') {
        order = [
            [minimumPriceExpression, filters.sort === 'price-asc' ? 'ASC' : 'DESC'],
            ...stableNameOrder
        ]
    } else if (filters.sort === 'featured') {
        order = [['created_at', 'DESC'], ['id', 'DESC']]
    }

    const facetWhere = { status: 'active' }
    const [totalItems, products, categoryFacets, brandFacets] = await Promise.all([
        Product.count({ where }),
        Product.findAll({
            where,
            include: productInclude,
            order,
            limit,
            offset: (page - 1) * limit
        }),
        Product.findAll({
            where: facetWhere,
            attributes: [
                'category',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['category'],
            raw: true
        }),
        Product.findAll({
            where: facetWhere,
            attributes: [
                'brand',
                [sequelize.fn('COUNT', sequelize.col('id')), 'count']
            ],
            group: ['brand'],
            raw: true
        })
    ])
    const normalizedTotal = Number(totalItems)
    const totalPages = Math.ceil(normalizedTotal / limit)

    return {
        items: products.map((product) => serializeProduct(product, {
            storefront: true
        })),
        pagination: {
            currentPage: page,
            pageSize: limit,
            totalItems: normalizedTotal,
            totalPages,
            hasPreviousPage: page > 1,
            hasNextPage: page < totalPages
        },
        facets: {
            categories: categoryFacets.map((item) => ({
                value: item.category,
                count: Number(item.count)
            })),
            brands: brandFacets
                .filter((item) => item.brand)
                .map((item) => ({
                    value: item.brand,
                    count: Number(item.count)
                }))
        }
    }
}

async function listOwnProducts(ownerId, filters) {
    const normalizedOwnerId = normalizeId(ownerId, 'owner id')
    const page = filters.page
    const limit = filters.limit
    const where = {
        owner_id: normalizedOwnerId
    }

    if (filters.search) {
        where.title = {
            [Op.like]: `%${escapeLikePattern(filters.search)}%`
        }
    }

    if (filters.categoryId) {
        const category = await Category.findOne({
            where: {
                id: filters.categoryId,
                status: 'active'
            },
            attributes: ['id']
        })

        if (!category) {
            throw createClientError('Category not found', 400)
        }

        where.category_id = category.id
    }

    if (filters.status) {
        where.status = filters.status
    }

    const priceConditions = []

    if (filters.minPrice !== undefined) {
        priceConditions.push(sequelize.where(maximumPriceExpression, {
            [Op.gte]: filters.minPrice
        }))
    }

    if (filters.maxPrice !== undefined) {
        priceConditions.push(sequelize.where(minimumPriceExpression, {
            [Op.lte]: filters.maxPrice
        }))
    }

    if (priceConditions.length) {
        where[Op.and] = priceConditions
    }

    const result = await Product.findAndCountAll({
        where,
        attributes: [
            'id',
            'title',
            'status',
            'created_at',
            'updatedAt',
            'price',
            'category_id',
            [minimumPriceExpression, 'min_price'],
            [maximumPriceExpression, 'max_price'],
            [totalStockExpression, 'total_stock'],
            [primaryImageExpression, 'primary_image_url']
        ],
        include: [{
            model: Category,
            as: 'categoryDetails',
            attributes: ['id', 'name', 'slug', 'accent'],
            where: {
                status: 'active'
            },
            required: false
        }],
        order: buildOwnProductsOrder(filters.sort),
        limit,
        offset: (page - 1) * limit,
        distinct: true,
        subQuery: false
    })
    const totalItems = Number(result.count)
    const totalPages = Math.ceil(totalItems / limit)

    if (page > Math.max(1, totalPages)) {
        throw createClientError('Page exceeds total pages', 400)
    }

    return {
        items: result.rows.map(serializeOwnProduct),
        pagination: {
            currentPage: page,
            pageSize: limit,
            totalItems,
            totalPages,
            hasPreviousPage: page > 1,
            hasNextPage: page < totalPages
        }
    }
}

async function getManagedProduct(ownerId, productId) {
    const normalizedOwnerId = normalizeId(ownerId, 'owner id')
    const normalizedProductId = normalizeId(productId, 'product id')
    const product = await Product.findOne({
        where: {
            id: normalizedProductId,
            owner_id: normalizedOwnerId
        },
        include: productInclude
    })

    if (!product) {
        throw createClientError('Product not found', 404)
    }

    return serializeProduct(product)
}

async function listDeletedProducts(ownerId, filters) {
    const normalizedOwnerId = normalizeId(ownerId, 'owner id')
    const page = filters.page
    const limit = filters.limit
    const where = {
        owner_id: normalizedOwnerId,
        deleted_at: {
            [Op.not]: null
        }
    }

    if (filters.search) {
        where.title = {
            [Op.like]: `%${escapeLikePattern(filters.search)}%`
        }
    }

    const result = await Product.findAndCountAll({
        paranoid: false,
        where,
        attributes: [
            'id',
            'title',
            'status',
            'createdAt',
            'deleted_at',
            'price',
            'category_id',
            [minimumPriceExpression, 'min_price'],
            [maximumPriceExpression, 'max_price'],
            [totalStockExpression, 'total_stock'],
            [primaryImageExpression, 'primary_image_url']
        ],
        include: [{
            model: Category,
            as: 'categoryDetails',
            attributes: ['id', 'name', 'slug', 'accent'],
            required: false
        }],
        order: [
            ['deleted_at', 'DESC'],
            ['id', 'DESC']
        ],
        limit,
        offset: (page - 1) * limit,
        distinct: true,
        subQuery: false
    })
    const totalItems = Number(result.count)
    const totalPages = Math.ceil(totalItems / limit)

    if (page > Math.max(1, totalPages)) {
        throw createClientError('Page exceeds total pages', 400)
    }

    return {
        items: result.rows.map(serializeDeletedProduct),
        pagination: {
            currentPage: page,
            pageSize: limit,
            totalItems,
            totalPages,
            hasPreviousPage: page > 1,
            hasNextPage: page < totalPages
        }
    }
}

function resolveUpdatedImages(currentImages, newImageUrls, imageOrder) {
    const sortedImages = [...currentImages].sort(
        (left, right) => left.sort_order - right.sort_order || left.id - right.id
    )

    if (imageOrder === undefined) {
        if (newImageUrls.length) {
            throw createClientError(
                'image_order is required when uploading new product images'
            )
        }

        return {
            imageUrls: sortedImages.map((image) => image.image_url),
            removedImageUrls: []
        }
    }

    const existingImages = new Map(
        sortedImages.map((image) => [String(image.id), image])
    )
    const retainedImageIds = new Set()
    const referencedNewImages = new Set()
    const imageUrls = imageOrder.map((token) => {
        const [source, rawId] = token.split(':')

        if (source === 'existing') {
            const image = existingImages.get(rawId)

            if (!image) {
                throw createClientError(
                    'An existing image does not belong to this product'
                )
            }

            retainedImageIds.add(String(image.id))
            return image.image_url
        }

        const newImageIndex = Number(rawId)

        if (
            !Number.isInteger(newImageIndex) ||
            newImageIndex < 0 ||
            newImageIndex >= newImageUrls.length
        ) {
            throw createClientError('A new product image does not exist')
        }

        referencedNewImages.add(newImageIndex)
        return newImageUrls[newImageIndex]
    })

    if (referencedNewImages.size !== newImageUrls.length) {
        throw createClientError(
            'Every uploaded product image must appear in image_order'
        )
    }

    if (imageUrls.length > 12) {
        throw createClientError('A product cannot contain more than 12 images')
    }

    return {
        imageUrls,
        removedImageUrls: sortedImages
            .filter((image) => !retainedImageIds.has(String(image.id)))
            .map((image) => image.image_url)
    }
}

async function updateProduct(
    ownerId,
    productId,
    productData,
    newImageUrls,
    newVariantImageUrls = []
) {
    const normalizedOwnerId = normalizeId(ownerId, 'owner id')
    const normalizedProductId = normalizeId(productId, 'product id')

    try {
        return await sequelize.transaction(async (transaction) => {
            const product = await Product.findOne({
                where: {
                    id: normalizedProductId,
                    owner_id: normalizedOwnerId
                },
                transaction,
                lock: transaction.LOCK.UPDATE
            })

            if (!product) {
                throw createClientError('Product not found', 404)
            }

            if (product.lock_version !== productData.lock_version) {
                throw createClientError(
                    'This product changed after you opened it. Reload and try again.',
                    409
                )
            }

            const currentImages = await ProductImage.findAll({
                where: {
                    product_id: product.id
                },
                order: [
                    ['sort_order', 'ASC'],
                    ['id', 'ASC']
                ],
                transaction,
                lock: transaction.LOCK.UPDATE
            })
            const currentVariantImages = await ProductVariantImage.findAll({
                include: [{
                    model: ProductVariant,
                    as: 'variant',
                    attributes: [],
                    where: {
                        product_id: product.id
                    }
                }],
                transaction,
                lock: transaction.LOCK.UPDATE
            })
            const {
                imageUrls,
                removedImageUrls
            } = resolveUpdatedImages(
                currentImages,
                newImageUrls,
                productData.image_order
            )
            const updates = {}
            const editableFields = [
                'title',
                'description',
                'brand',
                'price',
                'weight_grams'
            ]

            for (const field of editableFields) {
                if (Object.prototype.hasOwnProperty.call(productData, field)) {
                    updates[field] = field === 'brand'
                        ? productData[field] || null
                        : productData[field]
                }
            }

            if (Object.prototype.hasOwnProperty.call(productData, 'category_id')) {
                const category = await Category.findOne({
                    where: {
                        id: productData.category_id,
                        status: 'active'
                    },
                    transaction
                })

                if (!category) {
                    throw createClientError('Category not found', 400)
                }

                updates.category_id = category.id
                updates.category = category.slug
            }

            const replacesImages = productData.image_order !== undefined
            const replacesConfiguration = productData.options !== undefined
            let retainedVariantImageIds = new Set(
                currentVariantImages.map((image) => String(image.id))
            )

            if (newVariantImageUrls.length && !replacesConfiguration) {
                throw createClientError(
                    'Variant configuration is required when uploading variant images'
                )
            }

            if (replacesConfiguration) {
                const configurationData = {
                    ...productData,
                    title: productData.title || product.title
                }
                const configuration = prepareProductConfiguration(
                    configurationData,
                    imageUrls,
                    {
                        newImageUrls: newVariantImageUrls,
                        existingImages: new Map(
                            currentVariantImages.map((image) => [
                                String(image.id),
                                image
                            ])
                        )
                    }
                )
                retainedVariantImageIds =
                    configuration.referencedExistingVariantImages

                await ProductVariant.destroy({
                    where: {
                        product_id: product.id
                    },
                    transaction
                })
                await ProductOption.destroy({
                    where: {
                        product_id: product.id
                    },
                    transaction
                })
                await persistProductConfiguration(
                    product,
                    configurationData,
                    imageUrls,
                    configuration,
                    transaction
                )
            }

            if (replacesImages) {
                await ProductImage.destroy({
                    where: {
                        product_id: product.id
                    },
                    transaction
                })
                await ProductImage.bulkCreate(
                    imageUrls.map((imageUrl, index) => ({
                        product_id: product.id,
                        image_url: imageUrl,
                        sort_order: index
                    })),
                    { transaction }
                )
            }

            updates.lock_version = product.lock_version + 1
            await product.update(updates, {
                transaction
            })

            const updatedProduct = await Product.findByPk(product.id, {
                include: productInclude,
                transaction
            })

            return {
                product: serializeProduct(updatedProduct),
                removedImageUrls,
                removedVariantImageUrls: currentVariantImages
                    .filter((image) => !retainedVariantImageIds.has(
                        String(image.id)
                    ))
                    .map((image) => image.image_url)
            }
        })
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw createClientError(
                error.fields?.sku
                    ? 'SKU already exists'
                    : 'Product contains a duplicate option or variant',
                409
            )
        }
        throw error
    }
}

async function softDeleteProduct(ownerId, productId) {
    const normalizedOwnerId = normalizeId(ownerId, 'owner id')
    const normalizedProductId = normalizeId(productId, 'product id')

    return sequelize.transaction(async (transaction) => {
        const product = await Product.findOne({
            where: {
                id: normalizedProductId,
                owner_id: normalizedOwnerId
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (!product) {
            throw createClientError('Product not found', 404)
        }

        await product.destroy({ transaction })

        return {
            id: Number(product.id),
            title: product.title,
            deleted_at: product.get('deleted_at')
        }
    })
}

async function bulkSoftDeleteProducts(ownerId, productIds) {
    const normalizedOwnerId = normalizeId(ownerId, 'owner id')
    const submittedCount = productIds.length
    const normalizedIds = Array.from(new Set(
        productIds.map((id) => normalizeId(id, 'product id'))
    ))

    return sequelize.transaction(async (transaction) => {
        const products = await Product.findAll({
            where: {
                id: {
                    [Op.in]: normalizedIds
                },
                owner_id: normalizedOwnerId
            },
            attributes: ['id', 'title'],
            transaction,
            lock: transaction.LOCK.UPDATE
        })
        const deletedIds = products.map((product) => Number(product.id))

        if (deletedIds.length) {
            await Product.destroy({
                where: {
                    id: {
                        [Op.in]: deletedIds
                    },
                    owner_id: normalizedOwnerId
                },
                transaction
            })
        }

        return {
            submitted_count: submittedCount,
            requested_count: normalizedIds.length,
            deleted_count: deletedIds.length,
            skipped_count: normalizedIds.length - deletedIds.length,
            deleted_ids: deletedIds,
            deleted_products: products.map((product) => ({
                id: Number(product.id),
                title: product.title
            }))
        }
    })
}

async function bulkUpdateProductStatus(ownerId, productIds, status) {
    const normalizedOwnerId = normalizeId(ownerId, 'owner id')
    const normalizedIds = Array.from(new Set(
        productIds.map((id) => normalizeId(id, 'product id'))
    ))

    if (!bulkUpdatableProductStatuses.includes(status)) {
        throw createClientError('Unsupported product status', 400)
    }

    return sequelize.transaction(async (transaction) => {
        const products = await Product.findAll({
            where: {
                id: {
                    [Op.in]: normalizedIds
                },
                owner_id: normalizedOwnerId
            },
            attributes: ['id', 'status'],
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (products.length !== normalizedIds.length) {
            throw createClientError(
                'One or more products do not exist or you cannot update them',
                404
            )
        }

        const updatedIds = products
            .filter((product) => product.status !== status)
            .map((product) => Number(product.id))

        if (updatedIds.length) {
            await Product.update(
                {
                    status,
                    lock_version: sequelize.literal('lock_version + 1')
                },
                {
                    where: {
                        id: {
                            [Op.in]: updatedIds
                        },
                        owner_id: normalizedOwnerId
                    },
                    transaction
                }
            )
        }

        return {
            matchedCount: normalizedIds.length,
            updatedCount: updatedIds.length,
            status
        }
    })
}

async function restoreProduct(ownerId, productId) {
    const normalizedOwnerId = normalizeId(ownerId, 'owner id')
    const normalizedProductId = normalizeId(productId, 'product id')

    return sequelize.transaction(async (transaction) => {
        const product = await Product.findOne({
            paranoid: false,
            where: {
                id: normalizedProductId,
                owner_id: normalizedOwnerId,
                deleted_at: {
                    [Op.not]: null
                }
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (!product) {
            throw createClientError('Deleted product not found', 404)
        }

        let warning = null
        let category = null

        if (product.category_id) {
            category = await Category.findOne({
                where: {
                    id: product.category_id,
                    status: 'active'
                },
                attributes: ['id'],
                transaction
            })
        }

        if (!category) {
            warning = 'The original category is unavailable; review the product before publishing.'

            if (product.status === 'active') {
                product.status = 'draft'
            }
        }

        await product.restore({ transaction })
        product.lock_version += 1
        await product.save({ transaction })

        const restoredProduct = await Product.findByPk(product.id, {
            include: productInclude,
            transaction
        })

        return {
            product: serializeProduct(restoredProduct),
            warning
        }
    })
}

async function permanentlyDeleteProduct(ownerId, productId) {
    const normalizedOwnerId = normalizeId(ownerId, 'owner id')
    const normalizedProductId = normalizeId(productId, 'product id')

    return sequelize.transaction(async (transaction) => {
        const product = await Product.findOne({
            paranoid: false,
            where: {
                id: normalizedProductId,
                owner_id: normalizedOwnerId,
                deleted_at: {
                    [Op.not]: null
                }
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (!product) {
            throw createClientError('Deleted product not found', 404)
        }

        const images = await ProductImage.findAll({
            where: {
                product_id: product.id
            },
            attributes: ['image_url'],
            transaction
        })
        const variantImages = await ProductVariantImage.findAll({
            include: [{
                model: ProductVariant,
                as: 'variant',
                attributes: [],
                where: {
                    product_id: product.id
                }
            }],
            attributes: ['image_url'],
            transaction
        })
        const result = {
            id: Number(product.id),
            title: product.title,
            image_urls: [
                ...images.map((image) => image.image_url),
                ...variantImages.map((image) => image.image_url)
            ]
        }

        await product.destroy({
            force: true,
            transaction
        })

        return result
    })
}

async function createProduct(
    ownerId,
    productData,
    imageUrls,
    variantImageUrls = []
) {
    const configuration = prepareProductConfiguration(
        productData,
        imageUrls,
        { newImageUrls: variantImageUrls }
    )

    try {
        return await sequelize.transaction(
            async function createInTransaction(transaction) {
                const category = await Category.findOne({
                    where: {
                        id: productData.category_id,
                        status: 'active'
                    },
                    transaction
                })

                if (!category) {
                    throw createClientError('Category not found', 400)
                }

                const product = await Product.create(
                    {
                        owner_id: ownerId,
                        title: productData.title,
                        description: productData.description,
                        category: category.slug,
                        category_id: category.id,
                        brand: productData.brand || null,
                        price: productData.price,
                        stock: 0,
                        weight_grams: productData.weight_grams,
                        sizes: null,
                        colors: null,
                        status: 'draft'
                    },
                    { transaction }
                )

                await ProductImage.bulkCreate(
                    imageUrls.map((imageUrl, index) => ({
                        product_id: product.id,
                        image_url: imageUrl,
                        sort_order: index
                    })),
                    { transaction }
                )

                await persistProductConfiguration(
                    product,
                    productData,
                    imageUrls,
                    configuration,
                    transaction
                )

                await product.update(
                    { status: 'active' },
                    { transaction }
                )

                const createdProduct = await findActiveProduct(
                    product.id,
                    transaction
                )

                return serializeProduct(createdProduct)
            }
        )
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            throw createClientError(
                error.fields?.sku
                    ? 'SKU already exists'
                    : 'Product contains a duplicate option or variant',
                409
            )
        }
        throw error
    }
}

async function updateVariantStock(
    ownerId,
    productId,
    variantId,
    stockQuantity
) {
    const normalizedProductId = normalizeId(productId, 'product id')
    const normalizedVariantId = normalizeId(variantId, 'variant id')

    return sequelize.transaction(async (transaction) => {
        const product = await Product.findOne({
            where: {
                id: normalizedProductId,
                owner_id: ownerId
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (!product) {
            throw createClientError('Product not found', 404)
        }

        const variant = await ProductVariant.findOne({
            where: {
                id: normalizedVariantId,
                product_id: product.id
            },
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (!variant) {
            throw createClientError('Product variant not found', 404)
        }

        await variant.update(
            { stock_quantity: stockQuantity },
            { transaction }
        )
        await product.update(
            { lock_version: product.lock_version + 1 },
            { transaction }
        )

        const updatedProduct = await Product.findByPk(product.id, {
            include: productInclude,
            transaction
        })

        return serializeProduct(updatedProduct)
    })
}

module.exports = {
    bulkSoftDeleteProducts,
    bulkUpdateProductStatus,
    createProduct,
    getManagedProduct,
    getProductById,
    listDeletedProducts,
    listOwnProducts,
    listProducts,
    permanentlyDeleteProduct,
    restoreProduct,
    softDeleteProduct,
    updateProduct,
    updateVariantStock
}
