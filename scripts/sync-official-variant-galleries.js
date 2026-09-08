const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')

const sequelize = require('../src/config/database')
const { productsDirectory, productsUrlPrefix } = require('../src/config/uploads')
const {
    Product,
    ProductImage,
    ProductOption,
    ProductOptionValue,
    ProductVariant,
    ProductVariantImage,
    ProductVariantValue
} = require('../src/models')

const productSources = new Map([
    [41, 'https://xtep.vn/products/874119110023.js'],
    [42, 'https://xtep.vn/products/giay-chuyen-chay-bo-nu-xtep-360x-2-0-de-carbon-tro-luc-975218110044.js'],
    [47, 'https://t8.run/en-us/products/m-iced-tee.js'],
    [48, 'https://t8.run/en-us/products/m-sherpa-shorts.js'],
    [50, 'https://t8.run/en-us/products/trail-cap.js'],
    [79, 'https://t8.run/en-us/products/air-jacket.js'],
    [80, 'https://t8.run/en-us/products/air-socks.js'],
    [82, 'https://t8.run/en-us/products/w-sherpa-shorts.js'],
    [84, 'https://t8.run/en-us/products/mens-trail-tank.js'],
    [85, 'https://t8.run/en-us/products/womens-trail-tank.js'],
    [86, 'https://t8.run/en-us/products/mens-zone2-tee.js'],
    [87, 'https://t8.run/en-us/products/neck-gaiter.js']
])
const preferredSizes = new Map([
    [41, ['39', '40', '41', '42', '43', '44', '45']],
    [42, ['35', '36', '37', '38', '39']]
])

function absoluteUrl(value) {
    const url = String(value || '')
    return url.startsWith('//') ? `https:${url}` : url
}

function canonicalUrl(value) {
    return absoluteUrl(value).split('?')[0]
}

function safeSku(value, fallback) {
    const normalized = String(value || fallback)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
    return normalized.slice(0, 64)
}

function extension(contentType) {
    if (contentType.includes('png')) return '.png'
    if (contentType.includes('avif')) return '.avif'
    if (contentType.includes('webp')) return '.webp'
    return '.jpg'
}

async function downloadImage(url, productId) {
    const response = await fetch(absoluteUrl(url), {
        headers: {
            'user-agent': 'Mozilla/5.0 RunStoreVariantSync/1.0',
            accept: 'image/avif,image/webp,image/png,image/jpeg,*/*'
        }
    })
    if (!response.ok) throw new Error(`Image HTTP ${response.status}`)
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) throw new Error('Invalid image response')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
        throw new Error('Invalid image size')
    }
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    const filename = `variant-${productId}-${hash.slice(0, 18)}${extension(contentType)}`
    const filePath = path.join(productsDirectory, filename)
    await fs.writeFile(filePath, bytes)
    return {
        imageUrl: `${productsUrlPrefix}/${filename}`,
        filePath,
        hash
    }
}

function optionKind(option) {
    const name = option.name.toLowerCase()
    if (/(?:size|kích|kich|cỡ)/i.test(name)) return 'size'
    return 'color'
}

function sourceImageGroups(source, presentationIndex) {
    const allImages = (source.images || []).map(absoluteUrl)
    const values = source.options[presentationIndex].values
    const anchors = new Map()

    for (const value of values) {
        const variant = source.variants.find(
            (item) => item.options[presentationIndex] === value && item.featured_image?.src
        )
        const featured = absoluteUrl(variant?.featured_image?.src)
        const index = allImages.findIndex(
            (image) => canonicalUrl(image) === canonicalUrl(featured)
        )
        anchors.set(value, { featured, index })
    }

    const orderedAnchors = [...anchors.entries()]
        .filter(([, anchor]) => anchor.index >= 0)
        .sort((left, right) => left[1].index - right[1].index)
    const groups = new Map()

    for (const value of values) {
        const anchor = anchors.get(value)
        if (!anchor?.featured) continue
        const orderedIndex = orderedAnchors.findIndex(([name]) => name === value)
        const nextIndex = orderedAnchors[orderedIndex + 1]?.[1].index ?? allImages.length
        const images = anchor.index >= 0
            ? allImages.slice(anchor.index, nextIndex)
            : [anchor.featured]
        groups.set(value, [...new Set(images)].slice(0, 4))
    }

    return groups
}

async function syncProduct(productId, sourceUrl) {
    const product = await Product.findOne({
        where: { id: productId, status: 'active' },
        include: [{
            model: ProductImage,
            as: 'images'
        }, {
            model: ProductVariant,
            as: 'variants',
            include: [{
                model: ProductOptionValue,
                as: 'optionValues',
                through: { attributes: [] }
            }]
        }]
    })
    if (!product) return { productId, status: 'skipped', reason: 'not active' }

    const response = await fetch(sourceUrl, {
        headers: { 'user-agent': 'Mozilla/5.0 RunStoreVariantSync/1.0' }
    })
    if (!response.ok) throw new Error(`${product.title}: HTTP ${response.status}`)
    const source = await response.json()
    const presentationIndex = source.options.findIndex(
        (option) => optionKind(option) === 'color'
    )
    if (presentationIndex < 0 || source.options[presentationIndex].values.length < 2) {
        return { productId, status: 'skipped', reason: 'no multiple styles' }
    }
    const sizeIndex = source.options.findIndex(
        (option) => optionKind(option) === 'size'
    )
    const oldSizeOption = await ProductOption.findOne({
        where: { product_id: product.id, code: 'size' }
    })
    const oldSizes = new Set(product.variants.flatMap((variant) =>
        variant.optionValues
            .filter((value) => Number(value.product_option_id) === Number(oldSizeOption?.id))
            .map((value) => value.value)
    ))
    if (!oldSizes.size) {
        for (const size of preferredSizes.get(product.id) || []) oldSizes.add(size)
    }
    const sizeStock = new Map()
    for (const variant of product.variants) {
        const size = variant.optionValues.find((value) => oldSizes.has(value.value))?.value
        if (size && !sizeStock.has(size)) sizeStock.set(size, variant.stock_quantity)
    }

    const matchingSourceVariants = source.variants.filter((variant) =>
        sizeIndex < 0 || !oldSizes.size || oldSizes.has(variant.options[sizeIndex])
    )
    const candidateSourceVariants = matchingSourceVariants.length
        ? matchingSourceVariants
        : source.variants
    const seenCombinations = new Set()
    const sourceVariants = candidateSourceVariants.filter((variant) => {
        const key = [
            variant.options[presentationIndex],
            sizeIndex < 0 ? '' : variant.options[sizeIndex]
        ].join('\u0000')
        if (seenCombinations.has(key)) return false
        seenCombinations.add(key)
        return true
    })
    const usedPresentationValues = [...new Set(sourceVariants.map(
        (variant) => variant.options[presentationIndex]
    ))]
    if (!sourceVariants.length || !usedPresentationValues.length) {
        throw new Error(`${product.title}: official variants could not be matched`)
    }
    const sourceGroups = sourceImageGroups(source, presentationIndex)
    const downloadedGroups = new Map()
    const downloadedFiles = []

    await fs.mkdir(productsDirectory, { recursive: true })
    for (const value of usedPresentationValues) {
        const images = []
        const seenHashes = new Set()
        for (const url of sourceGroups.get(value) || []) {
            const image = await downloadImage(url, product.id)
            if (seenHashes.has(image.hash)) continue
            seenHashes.add(image.hash)
            images.push(image.imageUrl)
            downloadedFiles.push(image)
        }
        if (!images.length) throw new Error(`${product.title}: ${value} has no image`)
        downloadedGroups.set(value, images)
    }

    const productGallery = [...new Set(
        usedPresentationValues.flatMap((value) => downloadedGroups.get(value) || [])
    )].slice(0, 12)
    const oldImageUrls = product.images.map((image) => image.image_url)

    await sequelize.transaction(async (transaction) => {
        await ProductVariant.destroy({ where: { product_id: product.id }, transaction })
        await ProductOption.destroy({ where: { product_id: product.id }, transaction })
        await ProductImage.destroy({ where: { product_id: product.id }, transaction })

        await ProductImage.bulkCreate(productGallery.map((imageUrl, index) => ({
            product_id: product.id,
            image_url: imageUrl,
            sort_order: index
        })), { transaction })

        const presentationOption = await ProductOption.create({
            product_id: product.id,
            code: 'color',
            name: source.options[presentationIndex].name.toLowerCase() === 'style'
                ? 'Kiểu dáng'
                : 'Màu sắc',
            sort_order: 0
        }, { transaction })
        const optionValues = new Map()
        for (const [index, value] of usedPresentationValues.entries()) {
            optionValues.set(`color:${value}`, await ProductOptionValue.create({
                product_option_id: presentationOption.id,
                value,
                sort_order: index
            }, { transaction }))
        }

        const sizes = sizeIndex < 0 ? [] : [...new Set(sourceVariants.map(
            (variant) => variant.options[sizeIndex]
        ))]
        if (sizes.length) {
            const sizeOption = await ProductOption.create({
                product_id: product.id,
                code: 'size',
                name: 'Kích thước',
                sort_order: 1
            }, { transaction })
            for (const [index, value] of sizes.entries()) {
                optionValues.set(`size:${value}`, await ProductOptionValue.create({
                    product_option_id: sizeOption.id,
                    value,
                    sort_order: index
                }, { transaction }))
            }
        }

        const usedSkus = new Set()
        for (const [index, sourceVariant] of sourceVariants.entries()) {
            const color = sourceVariant.options[presentationIndex]
            const size = sizeIndex < 0 ? null : sourceVariant.options[sizeIndex]
            const selectedValues = [optionValues.get(`color:${color}`)]
            if (size) selectedValues.push(optionValues.get(`size:${size}`))
            let sku = safeSku(sourceVariant.sku, `T8-${product.id}-${color}-${size || index + 1}`)
            if (usedSkus.has(sku)) sku = `${sku.slice(0, 58)}-${index + 1}`
            usedSkus.add(sku)
            const gallery = downloadedGroups.get(color)
            const variant = await ProductVariant.create({
                product_id: product.id,
                sku,
                variant_key: selectedValues.map((value) => Number(value.id))
                    .sort((left, right) => left - right).join('-'),
                price: null,
                image_url: gallery[0],
                stock_quantity: sizeStock.get(size) || 10 + (index % 9),
                status: 'active',
                is_default: index === 0
            }, { transaction })
            await ProductVariantValue.bulkCreate(selectedValues.map((value) => ({
                product_variant_id: variant.id,
                product_option_value_id: value.id
            })), { transaction })
            await ProductVariantImage.bulkCreate(gallery.map((imageUrl, imageIndex) => ({
                product_variant_id: variant.id,
                image_url: imageUrl,
                sort_order: imageIndex
            })), { transaction })
        }
        await product.update({ lock_version: product.lock_version + 1 }, { transaction })
    })

    const retainedUrls = new Set(downloadedFiles.map((image) => image.imageUrl))
    for (const imageUrl of oldImageUrls) {
        if (!imageUrl.startsWith(productsUrlPrefix) || retainedUrls.has(imageUrl)) continue
        await fs.unlink(path.join(productsDirectory, path.basename(imageUrl))).catch(() => {})
    }
    return {
        productId,
        title: product.title,
        status: 'updated',
        values: usedPresentationValues,
        images: downloadedFiles.length,
        variants: sourceVariants.length
    }
}

async function main() {
    const report = []
    const idsArgument = process.argv.find((argument) => argument.startsWith('--ids='))
    const selectedIds = idsArgument
        ? new Set(idsArgument.slice('--ids='.length).split(',').map(Number))
        : null
    for (const [productId, sourceUrl] of productSources) {
        if (selectedIds && !selectedIds.has(productId)) continue
        try {
            report.push(await syncProduct(productId, sourceUrl))
        } catch (error) {
            report.push({
                productId,
                status: 'failed',
                reason: error.errors?.map((item) => item.message).join('; ') || error.message
            })
        }
    }
    console.log(JSON.stringify(report, null, 2))
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => sequelize.close())
