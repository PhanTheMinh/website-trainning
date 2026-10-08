const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')

const sequelize = require('../src/config/database')
const { productsDirectory, productsUrlPrefix } = require('../src/config/uploads')
const {
    Product,
    ProductImage,
    ProductOptionValue,
    ProductVariant,
    ProductVariantImage
} = require('../src/models')

const MAX_IMAGES = 8
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const FORCE_REFRESH = process.argv.includes('--refresh')
const SOURCE_OVERRIDES = new Map([
    [
        'Quần Shorts Chạy Bộ Economy II',
        'https://www.coolmate.me/product/quan-shorts-chay-bo-economy-ii'
    ],
    [
        'Áo thun chạy bộ nam Airflow ExDry Gradient',
        'https://www.coolmate.me/product/ao-thun-chay-bo-nam-airflow-exdry-gradient'
    ],
    [
        'Quần Shorts Chạy Bộ 7 inch Đa Năng',
        'https://www.coolmate.me/product/quan-shorts-nam-chay-bo-essentials-7-co-gian-nhanh-kho?color=cam'
    ],
    [
        'T8 Air Jacket',
        'https://t8.run/en-us/products/air-jacket'
    ],
    [
        'T8 Air Socks',
        'https://t8.run/en-us/products/air-socks'
    ],
    [
        'T8 Women’s Sherpa Shorts',
        'https://t8.run/en-us/products/w-sherpa-shorts'
    ],
    [
        'T8 Women’s Trail Tank',
        'https://t8.run/en-us/products/womens-trail-tank'
    ],
    [
        'T8 Neck Cooler',
        'https://t8.run/en-us/products/neck-cooler'
    ]
])
const LOCAL_GALLERIES = new Map([
    [
        'Adidas Adizero EVO SL Crystal White',
        Array.from({ length: 10 }, (_, index) => path.resolve(
            __dirname,
            '..',
            'frontend',
            'public',
            'products',
            'evo-sl-360',
            `${String(index + 1).padStart(2, '0')}.jpg`
        ))
    ]
])

function decodeHtml(value) {
    return String(value || '')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
}

function normalized(value) {
    return decodeHtml(value)
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

function meaningfulTokens(value) {
    return normalized(value).split(' ').filter((token) => token.length > 2)
}

function attribute(tag, name) {
    return tag.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))?.[1] || ''
}

function largestSrcsetUrl(tag) {
    const candidates = attribute(tag, 'srcset')
        .split(',')
        .map((candidate) => candidate.trim().split(/\s+/))
        .filter(([url]) => url)
        .map(([url, width]) => ({
            url,
            width: Number.parseInt(width, 10) || 0
        }))
        .sort((left, right) => right.width - left.width)

    return candidates[0]?.url || ''
}

function preferredImageUrl(value) {
    return String(value || '').replace(
        /([?&]aio=w-)\d+/i,
        (_match, prefix) => `${prefix}1100`
    )
}

function sourceFromDescription(description) {
    return String(description || '').match(
        /https:\/\/(?:www\.)?(?:adidas\.com\.vn|xtep\.vn|coolmate\.me|t8\.run|motive\.vn)\/[^\s]+/i
    )?.[0] || ''
}

async function fetchWithTimeout(url, timeoutMs = 10000) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetch(url, {
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'user-agent': 'Mozilla/5.0 RunStoreGalleryAudit/1.0',
                accept: 'text/html,image/avif,image/webp,image/png,image/jpeg,*/*'
            }
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response
    } finally {
        clearTimeout(timeout)
    }
}

function findProductPage(html, collectionUrl, title) {
    const expected = meaningfulTokens(title)
    const links = html.match(/<a\s+[^>]*href=["'][^"']+["'][^>]*>[\s\S]*?<\/a>/gi) || []
    let best = null

    for (const tag of links) {
        const href = attribute(tag, 'href')
        if (!/\/products?\//i.test(href)) continue
        const text = normalized(tag.replace(/<[^>]+>/g, ' '))
        const score = expected.reduce(
            (sum, token) => sum + (text.includes(token) ? 1 : 0),
            0
        )
        if (!best || score > best.score) best = { href, score }
    }

    const minimumScore = Math.max(3, Math.ceil(expected.length * 0.6))
    return best?.score >= minimumScore
        ? new URL(decodeHtml(best.href), collectionUrl).toString()
        : ''
}

function findGalleryUrls(html, pageUrl, title) {
    const expected = meaningfulTokens(title)
    const minimumScore = Math.max(2, Math.ceil(expected.length * 0.3))
    const candidates = []

    for (const tag of html.match(/<img\s+[^>]*>/gi) || []) {
        const alt = normalized(attribute(tag, 'alt'))
        const score = expected.reduce(
            (sum, token) => sum + (alt.includes(token) ? 1 : 0),
            0
        )
        const rawUrl = attribute(tag, 'data-img') ||
            attribute(tag, 'data-zoom-image') ||
            attribute(tag, 'data-src') ||
            largestSrcsetUrl(tag) ||
            attribute(tag, 'src')

        if (!rawUrl || score < minimumScore) continue

        let url
        try {
            url = preferredImageUrl(
                new URL(decodeHtml(rawUrl), pageUrl).toString()
            )
        } catch {
            continue
        }
        if (
            /theme\.|\/theme\//i.test(url) ||
            /(?:\/|[-_])(?:icon|banner|promo|placeholder)(?:[/._-]|$)/i.test(url)
        ) continue
        candidates.push({ url, score })
    }

    for (const match of html.matchAll(
        /https:\/\/[^"'\\\s]+\.(?:avif|webp|jpe?g|png)(?:\?[^"'\\\s]*)?/gi
    )) {
        const url = preferredImageUrl(
            decodeHtml(match[0]).replace(/\\u0026/g, '&')
        )
        const score = expected.reduce(
            (sum, token) => sum + (normalized(url).includes(token) ? 1 : 0),
            0
        )
        if (
            score < minimumScore ||
            /(?:\/|[-_])(?:icon|banner|promo|placeholder)(?:[/._-]|$)/i.test(url)
        ) {
            continue
        }
        candidates.push({ url, score })
    }

    const seen = new Set()
    const maximumScore = Math.max(0, ...candidates.map((candidate) => candidate.score))
    return candidates
        .filter((candidate) => candidate.score === maximumScore)
        .sort((left, right) => right.score - left.score)
        .map((candidate) => candidate.url)
        .filter((url) => {
            const key = url.replace(/_(?:small|medium|large|1024x1024)(?=\.[a-z]+(?:\?|$))/i, '')
            if (seen.has(key)) return false
            seen.add(key)
            return true
        })
        .slice(0, MAX_IMAGES)
}

function extension(contentType) {
    if (contentType.includes('png')) return '.png'
    if (contentType.includes('webp')) return '.webp'
    if (contentType.includes('avif')) return '.avif'
    return '.jpg'
}

async function downloadImage(url, productId) {
    const response = await fetchWithTimeout(url)
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) throw new Error('not an image')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
        throw new Error('invalid image size')
    }
    const hash = crypto.createHash('sha256').update(bytes).digest('hex')
    const filename = `gallery-${productId}-${hash.slice(0, 16)}${extension(contentType)}`
    const filePath = path.join(productsDirectory, filename)
    await fs.writeFile(filePath, bytes)
    return { hash, filePath, imageUrl: `${productsUrlPrefix}/${filename}` }
}

async function enrichProduct(product) {
    const localGallery = LOCAL_GALLERIES.get(product.title)
    if (localGallery) {
        await fs.mkdir(productsDirectory, { recursive: true })
        const downloaded = []
        for (const sourcePath of localGallery) {
            const bytes = await fs.readFile(sourcePath)
            const hash = crypto.createHash('sha256').update(bytes).digest('hex')
            const filename = `gallery-${product.id}-${hash.slice(0, 16)}.jpg`
            const filePath = path.join(productsDirectory, filename)
            await fs.writeFile(filePath, bytes)
            downloaded.push({ filePath, imageUrl: `${productsUrlPrefix}/${filename}` })
        }
        const oldImages = await ProductImage.findAll({ where: { product_id: product.id } })
        await sequelize.transaction(async (transaction) => {
            await ProductImage.destroy({ where: { product_id: product.id }, transaction })
            await ProductImage.bulkCreate(downloaded.map((image, index) => ({
                product_id: product.id,
                image_url: image.imageUrl,
                sort_order: index
            })), { transaction })
        })
        const retainedUrls = new Set(downloaded.map((image) => image.imageUrl))
        for (const image of oldImages) {
            if (
                !image.image_url.startsWith(productsUrlPrefix) ||
                retainedUrls.has(image.image_url)
            ) continue
            await fs.unlink(path.join(productsDirectory, path.basename(image.image_url))).catch(() => {})
        }
        return { status: 'updated', count: downloaded.length, source: 'verified local 360 set' }
    }

    const currentImages = await ProductImage.findAll({
        where: { product_id: product.id }
    })
    const usableCurrentImageCount = (await Promise.all(currentImages.map(async (image) => {
        if (!image.image_url.startsWith(productsUrlPrefix)) return true
        return fs.access(
            path.join(productsDirectory, path.basename(image.image_url))
        ).then(() => true).catch(() => false)
    }))).filter(Boolean).length
    const minimumGallerySize = usableCurrentImageCount >= 3 ? 3 : 2
    if (
        currentImages.length >= 3 &&
        currentImages.every((image) => path.basename(image.image_url).startsWith('gallery-')) &&
        !SOURCE_OVERRIDES.has(product.title) &&
        !FORCE_REFRESH
    ) {
        return { status: 'skipped', reason: 'already enriched' }
    }

    let pageUrl = SOURCE_OVERRIDES.get(product.title) ||
        sourceFromDescription(product.description)
    if (!pageUrl) return { status: 'skipped', reason: 'no official source URL' }

    let response = await fetchWithTimeout(pageUrl)
    let html = await response.text()
    if (/\/collections?\//i.test(pageUrl)) {
        const detailUrl = findProductPage(html, pageUrl, product.title)
        if (!detailUrl) return { status: 'skipped', reason: 'no reliable product page match' }
        pageUrl = detailUrl
        response = await fetchWithTimeout(pageUrl)
        html = await response.text()
    }

    const urls = findGalleryUrls(html, pageUrl, product.title)
    if (urls.length < minimumGallerySize) {
        return { status: 'skipped', reason: `only ${urls.length} trusted images` }
    }

    await fs.mkdir(productsDirectory, { recursive: true })
    const downloaded = []
    const hashes = new Set()
    for (const url of urls) {
        try {
            const image = await downloadImage(url, product.id)
            if (hashes.has(image.hash)) {
                continue
            }
            hashes.add(image.hash)
            downloaded.push(image)
        } catch {
            // A broken candidate must not abort the rest of a verified gallery.
        }
    }

    if (downloaded.length < minimumGallerySize) {
        await Promise.all(downloaded.map((image) => fs.unlink(image.filePath).catch(() => {})))
        return { status: 'skipped', reason: `only ${downloaded.length} downloadable images` }
    }

    const oldImages = await ProductImage.findAll({ where: { product_id: product.id } })
    await sequelize.transaction(async (transaction) => {
        await ProductImage.destroy({ where: { product_id: product.id }, transaction })
        await ProductImage.bulkCreate(downloaded.map((image, index) => ({
            product_id: product.id,
            image_url: image.imageUrl,
            sort_order: index
        })), { transaction })
    })

    const retainedUrls = new Set(downloaded.map((image) => image.imageUrl))
    for (const image of oldImages) {
        if (
            !image.image_url.startsWith(productsUrlPrefix) ||
            retainedUrls.has(image.image_url)
        ) continue
        const file = path.join(productsDirectory, path.basename(image.image_url))
        await fs.unlink(file).catch(() => {})
    }
    return { status: 'updated', count: downloaded.length, source: pageUrl }
}

async function mapExistingColorGallery(product) {
    const images = await ProductImage.findAll({
        where: { product_id: product.id },
        order: [['sort_order', 'ASC'], ['id', 'ASC']]
    })
    if (images.length < 2) return 0

    const variants = await ProductVariant.findAll({
        where: { product_id: product.id, status: 'active' },
        include: [{
            model: ProductOptionValue,
            as: 'optionValues',
            through: { attributes: [] }
        }]
    })
    const colors = [...new Set(variants.map((variant) =>
        variant.optionValues.find((value) => value.product_option_id &&
            /(?:cam|tím|xanh|đen|trắng|đỏ|hồng)/i.test(value.value))?.value
    ).filter(Boolean))]
    if (!colors.length) return 0

    const imagesPerColor = Math.max(1, Math.floor(images.length / colors.length))
    const colorChunk = new Map()
    const usedChunks = new Set()
    for (const color of colors) {
        const representative = variants.find((variant) =>
            variant.image_url && variant.optionValues.some((value) => value.value === color)
        )
        const imageIndex = images.findIndex(
            (image) => image.image_url === representative?.image_url
        )
        if (imageIndex >= 0) {
            const chunk = Math.floor(imageIndex / imagesPerColor)
            colorChunk.set(color, chunk)
            usedChunks.add(chunk)
        }
    }
    for (const color of colors) {
        if (colorChunk.has(color)) continue
        const availableChunk = Array.from(
            { length: colors.length },
            (_, index) => index
        ).find((index) => !usedChunks.has(index))
        colorChunk.set(color, availableChunk ?? 0)
        usedChunks.add(availableChunk)
    }
    let created = 0
    await sequelize.transaction(async (transaction) => {
        for (const variant of variants) {
            const color = variant.optionValues.find((value) => colors.includes(value.value))?.value
            if (!color) continue
            const colorIndex = colorChunk.get(color)
            const gallery = images.slice(
                colorIndex * imagesPerColor,
                colorIndex === colors.length - 1
                    ? images.length
                    : (colorIndex + 1) * imagesPerColor
            )
            await ProductVariantImage.destroy({
                where: { product_variant_id: variant.id },
                transaction
            })
            await ProductVariantImage.bulkCreate(gallery.map((image, index) => ({
                product_variant_id: variant.id,
                image_url: image.image_url,
                sort_order: index
            })), { transaction })
            await variant.update({ image_url: gallery[0]?.image_url || null }, { transaction })
            created += gallery.length
        }
    })
    return created
}

async function main() {
    const idsArgument = process.argv.find((argument) => argument.startsWith('--ids='))
    const selectedIds = idsArgument
        ? new Set(idsArgument.slice('--ids='.length).split(',').map(Number))
        : null
    const allProducts = await Product.findAll({
        where: { status: 'active' },
        order: [['id', 'ASC']]
    })
    const products = selectedIds
        ? allProducts.filter((product) => selectedIds.has(Number(product.id)))
        : allProducts
    const report = new Array(products.length)
    let nextIndex = 0
    const workers = Array.from({ length: 5 }, async () => {
        while (nextIndex < products.length) {
            const index = nextIndex++
            const product = products[index]
            try {
                report[index] = {
                    id: product.id,
                    title: product.title,
                    ...await enrichProduct(product)
                }
            } catch (error) {
                report[index] = {
                    id: product.id,
                    title: product.title,
                    status: 'failed',
                    reason: error.message
                }
            }
        }
    })
    await Promise.all(workers)

    let variantImages = 0
    for (const product of products) {
        variantImages += await mapExistingColorGallery(product)
    }

    console.log(JSON.stringify({
        updated: report.filter((item) => item.status === 'updated').length,
        skipped: report.filter((item) => item.status === 'skipped').length,
        failed: report.filter((item) => item.status === 'failed').length,
        variantImages,
        report
    }, null, 2))
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => sequelize.close())
