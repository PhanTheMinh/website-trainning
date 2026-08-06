const sequelize = require('../config/database')
const { Product, ProductImage, User } = require('../models')

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
    }
]

function normalizeProductId(productId) {
    const normalizedId = Number(productId)

    if (!Number.isSafeInteger(normalizedId) || normalizedId <= 0) {
        const error = new Error('Invalid product id')
        error.statusCode = 400
        throw error
    }

    return normalizedId
}

function serializeProduct(product) {
    const value = product.get({
        plain: true
    })

    return {
        ...value,
        price: Number(value.price),
        sizes: value.sizes || [],
        colors: value.colors || [],
        images: (value.images || []).sort(
            (left, right) => left.sort_order - right.sort_order
        )
    }
}

async function getProductById(productId) {
    const id = normalizeProductId(productId)
    const product = await Product.findOne({
        where: {
            id,
            status: 'active'
        },
        include: productInclude
    })

    if (!product) {
        const error = new Error('Product not found')
        error.statusCode = 404
        throw error
    }

    return serializeProduct(product)
}

async function listProducts(filters = {}) {
    const where = {
        status: 'active'
    }

    if (filters.category) {
        where.category = filters.category
    }

    const products = await Product.findAll({
        where,
        include: productInclude,
        order: [
            ['title', 'ASC']
        ]
    })

    return products.map(serializeProduct)
}

async function createProduct(ownerId, productData, imageUrls) {
    return sequelize.transaction(
        async function createInTransaction(transaction) {
            const product = await Product.create(
                {
                    owner_id: ownerId,
                    title: productData.title,
                    description: productData.description,
                    category: productData.category,
                    price: productData.price,
                    stock: productData.stock,
                    weight_grams: productData.weight_grams,
                    sizes: productData.sizes.length
                        ? productData.sizes
                        : null,
                    colors: productData.colors.length
                        ? productData.colors
                        : null,
                    status: 'active'
                },
                {
                    transaction
                }
            )

            await ProductImage.bulkCreate(
                imageUrls.map((imageUrl, index) => ({
                    product_id: product.id,
                    image_url: imageUrl,
                    sort_order: index
                })),
                {
                    transaction
                }
            )

            const createdProduct = await Product.findByPk(product.id, {
                include: productInclude,
                transaction
            })

            return serializeProduct(createdProduct)
        }
    )
}

module.exports = {
    createProduct,
    getProductById,
    listProducts
}
