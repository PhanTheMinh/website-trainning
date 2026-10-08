const fs = require('fs/promises')
const path = require('path')

const sequelize = require('../src/config/database')
const { productsDirectory, productsUrlPrefix } = require('../src/config/uploads')
const {
    Product,
    ProductImage,
    ProductVariant,
    ProductVariantImage
} = require('../src/models')

async function isUsableImageUrl(imageUrl) {
    if (!imageUrl) return false
    if (!imageUrl.startsWith(productsUrlPrefix)) return true

    return fs.access(
        path.join(productsDirectory, path.basename(imageUrl))
    ).then(() => true).catch(() => false)
}

async function main() {
    const products = await Product.findAll({
        where: { status: 'active' },
        include: [{
            model: ProductImage,
            as: 'images'
        }, {
            model: ProductVariant,
            as: 'variants',
            include: [{
                model: ProductVariantImage,
                as: 'images'
            }]
        }],
        order: [['id', 'ASC']]
    })
    const repaired = []
    const unresolved = []

    await sequelize.transaction(async (transaction) => {
        for (const product of products) {
            const productFallback = [...product.images]
                .sort((left, right) => left.sort_order - right.sort_order)
                .map((image) => image.image_url)
                .find((imageUrl) => imageUrl)

            for (const variant of product.variants) {
                if (await isUsableImageUrl(variant.image_url)) continue

                const variantFallbacks = [...variant.images]
                    .sort((left, right) => left.sort_order - right.sort_order)
                    .map((image) => image.image_url)
                const fallback = variantFallbacks.find(
                    (imageUrl) => imageUrl
                ) || productFallback

                if (!fallback || !await isUsableImageUrl(fallback)) {
                    unresolved.push({ productId: product.id, variantId: variant.id })
                    continue
                }

                await variant.update({ image_url: fallback }, { transaction })
                repaired.push({ productId: product.id, variantId: variant.id })
            }
        }
    })

    console.log(JSON.stringify({
        repaired: repaired.length,
        unresolved
    }, null, 2))
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => sequelize.close())
