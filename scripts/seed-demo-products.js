const crypto = require('crypto')
const fs = require('fs/promises')
const path = require('path')

const sequelize = require('../src/config/database')
const { productsDirectory, productsUrlPrefix } = require('../src/config/uploads')
const { Category, Product, ProductVariant, User } = require('../src/models')
const productService = require('../src/services/products.service')
const expandedCatalog = require('./data/expanded-demo-products')

// These old demo rows did not have an exact official product page. Keeping them
// caused generic collection thumbnails to be assigned to unrelated products.
const unverifiedCatalogCodes = new Set([
    'CM-RUN-2L-ESSENTIAL',
    'CM-RUN-TEE-EXDRY',
    'CM-RUN-CAP',
    'MOT-W-SIMPLE-SINGLET',
    'MOT-RUN-CAP-PRO'
])

const catalog = [
    {
        code: 'ADI-EVO-SL-WHITE',
        brand: 'Adidas',
        title: 'Adidas Adizero EVO SL Crystal White',
        category: 'giay-chay-bo',
        price: 4000000,
        weight: 224,
        sizes: ['39', '40', '41', '42', '43'],
        source: 'https://www.adidas.com.vn/vi/giay-adizero-evo-sl/KJ1959.html',
        image: 'https://assets.adidas.com/images/h_840,f_auto,q_auto,fl_lossy,c_fill,g_auto/ee395c8119754b99a7a9c6b6b02b4c96_9366/Giay_Adizero_EVO_SL_trang_KJ1959_HM1.jpg',
        description: 'Mẫu giày chạy tốc độ có đế giữa Lightstrike Pro nhẹ và phản hồi tốt. Thân giày vải dệt thoáng khí, đế cao su phù hợp chạy đường nhựa, dùng linh hoạt cho buổi tempo, bài tốc độ hoặc chạy hằng ngày.'
    },
    {
        code: 'ADI-SUPERNOVA-RISE2',
        brand: 'Adidas',
        title: 'Adidas Supernova Rise 2 Orbit Grey',
        category: 'giay-chay-bo',
        price: 1900000,
        weight: 275,
        sizes: ['39', '40', '41', '42', '43'],
        source: 'https://www.adidas.com.vn/vi/giay-chay-bo-supernova-rise-2/JI4510.html',
        image: 'https://assets.adidas.com/images/c_fill,g_auto,w_1200,h_630,f_auto,q_auto/w_500,f_auto,q_auto/ac6108304b144ac88316b317b710fdce_9366/Giay_Chay_Bo_Supernova_Rise_2_Xam_JI4510_HM1.jpg',
        description: 'Giày chạy hằng ngày cân bằng giữa độ êm và khả năng nâng đỡ. Đế giữa Dreamstrike+ tạo cảm giác mềm nhưng ổn định, thân lưới kỹ thuật hỗ trợ thoáng khí và chuyển tiếp bước chân mượt mà.'
    },
    {
        code: 'ADI-ADIOS-PRO4',
        brand: 'Adidas',
        title: 'Adidas Adizero Adios Pro 4',
        category: 'giay-chay-bo',
        price: 6500000,
        weight: 200,
        sizes: ['39', '40', '41', '42', '43'],
        source: 'https://www.adidas.com.vn/vi/giay-adizero-adios-pro-4/JQ4445.html',
        image: 'https://assets.adidas.com/images/c_fill,g_auto,w_1200,h_630,f_auto,q_auto/w_500,f_auto,q_auto/c8cbe28769484db386ce225e34bb010b_9366/GIAY_ADIZERO_ADIOS_PRO_4_trang_JQ4445_01_00_standard.jpg',
        description: 'Giày thi đấu đường nhựa hướng tới cự ly dài, sử dụng đệm Lightstrike Pro và hệ thống EnergyRods 2.0 để hỗ trợ lực đẩy. Trọng lượng nhẹ, độ chênh gót-mũi 6 mm và form ôm vừa cho ngày đua.'
    },
    {
        code: 'ADI-EVO-SL-BLACK',
        brand: 'Adidas',
        title: 'Adidas Adizero EVO SL Core Black',
        category: 'giay-chay-bo',
        price: 4000000,
        weight: 224,
        sizes: ['39', '40', '41', '42', '43'],
        source: 'https://www.adidas.com.vn/vi/giay-adizero-evo-sl/JP7149.html',
        image: 'https://assets.adidas.com/images/c_fill,g_auto,w_1200,h_630,f_auto,q_auto/w_500,f_auto,q_auto/b8d2e6f0cdd940f6bb2988cb68ee5bf0_9366/Giay_Adizero_EVO_SL_DJen_JP7149_HM1.jpg',
        description: 'Phiên bản Core Black của Adizero EVO SL dành cho runner yêu thích thiết kế tối giản. Đế giữa Lightstrike Pro ưu tiên độ nhẹ và độ nảy, phù hợp chạy biến tốc, tempo và các buổi chạy đường nhựa.'
    },
    {
        code: 'XTEP-360X3-MEN',
        brand: 'Xtep',
        title: 'Xtep 360X 3.0 Nam',
        category: 'giay-chay-bo',
        price: 2072000,
        weight: 260,
        sizes: ['39', '40', '42', '43', '45'],
        source: 'https://xtep.vn/products/giay-chay-bo-nam-360x-3-0-xtep-974219110001',
        description: 'Giày tập luyện hằng ngày cho cự ly khoảng 3–10 km. Upper vải dệt thoáng khí ôm chân, đế giữa hỗ trợ giảm áp lực khi tiếp đất và đế ngoài cao su composite tăng độ bền trên đường phố hoặc sân tập.'
    },
    {
        code: 'XTEP-360X3-WOMEN',
        brand: 'Xtep',
        title: 'Xtep 360X 3.0 Nữ',
        category: 'giay-chay-bo',
        price: 2072000,
        weight: 235,
        sizes: ['36', '37', '38', '39', '40'],
        source: 'https://xtep.vn/products/giay-chay-bo-nu-360x-3-0-xtep-974218110002',
        description: 'Giày chạy nữ có upper lưới thoáng khí, đế giữa NFO Soft Elastic hỗ trợ giảm chấn và đế ngoài A-GRIP PRO tăng độ bám. Phù hợp luyện tập thường ngày và sử dụng theo phong cách thể thao.'
    },
    {
        code: 'XTEP-2000KM5-MEN',
        brand: 'Xtep',
        title: 'Xtep 2000KM 5.0 Nam',
        category: 'giay-chay-bo',
        price: 1445400,
        weight: 270,
        sizes: ['39', '40', '41', '42', '43'],
        source: 'https://xtep.vn/products/874119110023',
        description: 'Mẫu giày bền bỉ cho nhu cầu tích lũy quãng đường, có nhiều phối màu và dải size dễ chọn. Thiết kế hướng đến độ ổn định, độ bám và cảm giác thoải mái trong các buổi chạy nền hằng tuần.'
    },
    {
        code: 'XTEP-360X2-WOMEN',
        brand: 'Xtep',
        title: 'Xtep 360X 2.0 Carbon Nữ',
        category: 'giay-chay-bo',
        price: 1813000,
        weight: 230,
        sizes: ['35', '36', '37', '38', '39'],
        source: 'https://xtep.vn/products/giay-chuyen-chay-bo-nu-xtep-360x-2-0-de-carbon-tro-luc-975218110044',
        description: 'Giày chạy nữ có tấm trợ lực hướng đến những buổi tập tốc độ. Form gọn, upper thoáng và bộ đế phản hồi giúp bước chạy linh hoạt hơn trên đường nhựa, đồng thời vẫn đủ ổn định cho tập luyện thường xuyên.'
    },
    {
        code: 'CM-RUN-LOGO-TEE',
        brand: 'Coolmate',
        title: 'Áo thun chạy bộ nam Logo Coolmate',
        category: 'ao-chay-bo',
        price: 191000,
        weight: 105,
        sizes: ['S', 'M', 'L', 'XL', '2XL'],
        source: 'https://www.coolmate.me/product/ao-thun-chay-bo-nam-logo-coolmate?color=trang',
        description: 'Áo chạy bộ polyester nhẹ với công nghệ ExDry hỗ trợ thoát ẩm và nhanh khô. Kiểu dệt mini square tăng lưu thông không khí, form regular dễ vận động và logo phản quang hỗ trợ nhận diện khi thiếu sáng.'
    },
    {
        code: 'CM-ULTRA-FF2',
        brand: 'Coolmate',
        title: 'Quần Shorts Chạy Bộ Ultra Fast & Free II',
        category: 'quan-chay-bo',
        price: 269000,
        weight: 125,
        sizes: ['M', 'L', 'XL', '2XL', '3XL'],
        source: 'https://www.coolmate.me/product/quan-shorts-nam-chay-bo-ultra-fast-free-run-ii-exdry-nhanh-kho',
        description: 'Quần short chạy bộ sử dụng polyester dệt kép, trọng lượng nhẹ và công nghệ ExDry nhanh khô. Hệ thống túi hỗ trợ mang điện thoại, chìa khóa hoặc thẻ, phù hợp chạy hằng ngày và tập luyện ngoài trời.'
    },
    {
        code: 'CM-FF3-2LAYER',
        brand: 'Coolmate',
        title: 'Quần Shorts Chạy Bộ 2 Lớp Fast & Free III',
        category: 'quan-chay-bo',
        price: 399000,
        weight: 175,
        sizes: ['M', 'L', 'XL', '2XL', '3XL'],
        source: 'https://www.coolmate.me/product/quan-shorts-nam-chay-bo-2-lop-essentials-fast-free-run-v3-nhanh-kho?color=xam',
        description: 'Quần chạy hai lớp có lớp ngoài siêu nhẹ và lớp trong co giãn hỗ trợ vận động. Chất liệu nhanh khô, thấm hút tốt và có thành phần polyester tái chế, thích hợp chạy dài hoặc tập cường độ cao.'
    },
    {
        code: 'CM-GRADIENT-TANK',
        brand: 'Coolmate',
        title: 'Tanktop Chạy Bộ Nam Gradient',
        category: 'ao-chay-bo',
        price: 199000,
        weight: 92,
        sizes: ['S', 'M', 'L', 'XL', '2XL'],
        source: 'https://www.coolmate.me/product/tank-top-chay-bo-nam-gradient',
        description: 'Áo tanktop chạy bộ siêu nhẹ bằng polyester, ứng dụng ExDry để thấm hút và đẩy nhanh quá trình bay hơi. Bề mặt mini square thoáng khí, logo phản quang và thiết kế sát nách giúp cử động tự do.'
    },
    {
        code: 'T8-ICED-TEE',
        brand: 'T8',
        title: 'T8 Men’s Iced Tee',
        category: 'ao-chay-bo',
        price: 990000,
        weight: 110,
        sizes: ['XS', 'S', 'M', 'L', 'XL'],
        source: 'https://t8.run/en-us/products/m-iced-tee',
        description: 'Áo chạy thời tiết nóng kết hợp vải điều hòa nhiệt 37.5® và mảng lưới co giãn bên hông. Trọng lượng nhẹ, đường may flatlock thấp giúp hạn chế ma sát và tăng thông gió khi chạy dài.'
    },
    {
        code: 'T8-SHERPA-SHORTS',
        brand: 'T8',
        title: 'T8 Men’s Sherpa Shorts',
        category: 'quan-chay-bo',
        price: 1690000,
        weight: 145,
        sizes: ['XS', 'S', 'M', 'L', 'XL'],
        source: 'https://t8.run/en-us/products/m-sherpa-shorts',
        description: 'Quần short chạy trail tích hợp đai chứa đồ với bốn túi lưới co giãn, phù hợp mang nước mềm, điện thoại và gel. Vải 78 gsm co giãn bốn chiều, phủ DWR và có giá gắn bib tháo rời.'
    },
    {
        code: 'T8-COMMANDOS',
        brand: 'T8',
        title: 'T8 Men’s Commandos Running Underwear',
        category: 'quan-chay-bo',
        price: 529000,
        weight: 40,
        sizes: ['XS', 'S', 'M', 'L', 'XL'],
        source: 'https://t8.run/en-us/products/m-commandos',
        description: 'Quần lót chạy bộ toàn chân siêu nhẹ, thiết kế không đường may ở mặt trong đùi để hạn chế cọ xát. Vải lưới thoáng và thấm hút nhanh, phù hợp chạy trail hoặc các cự ly dài.'
    },
    {
        code: 'T8-TRAIL-CAP',
        brand: 'T8',
        title: 'T8 Trail Cap',
        category: 'phu-kien-chay-bo',
        price: 599000,
        weight: 58,
        sizes: [],
        source: 'https://t8.run/en-us/products/trail-cap',
        description: 'Mũ chạy trail nhẹ với vành mềm có thể gấp gọn, hai bên lưới thoáng và dải thấm mồ hôi bên trong. Dây phía sau điều chỉnh linh hoạt, phù hợp tập luyện, thi đấu và hoạt động ngoài trời.'
    },
    {
        code: 'MOT-RACE-SINGLET',
        brand: 'Motive',
        title: 'Motive Men Race Singlet 49g',
        category: 'ao-chay-bo',
        price: 379000,
        weight: 49,
        sizes: ['XS', 'S', 'M', 'L', 'XL', '2XL'],
        source: 'https://motive.vn/products/ao-thun-the-thao-chay-bo-nam-motive-men-race-singlet-49g-mau-xanh-la',
        description: 'Áo singlet chạy bộ siêu nhẹ khoảng 49 g, sử dụng sợi tái chế và kỹ thuật cắt laser giảm đường may. Thiết kế hướng đến độ thoáng, hạn chế cọ xát và sự thoải mái trên các cự ly dài.'
    },
    {
        code: 'MOT-BOXER-LAYER',
        brand: 'Motive',
        title: 'Motive Boxer Layer Short 2 Lớp',
        category: 'quan-chay-bo',
        price: 495000,
        weight: 180,
        sizes: ['XS', 'S', 'M', 'L', 'XL'],
        source: 'https://motive.vn/products/unisex-quan-the-thao-chay-bo-2-lop-motive-boxer-layer-short-tich-hop-quan-lot-boxer-ben-trong',
        description: 'Quần chạy unisex hai lớp với lớp ngoài nhẹ, nhanh khô và lớp boxer co giãn bốn chiều hỗ trợ giảm ma sát. Túi ẩn sau lưng chứa vật dụng nhỏ, cạp bản lớn có dây rút dễ điều chỉnh.'
    },
    {
        code: 'MOT-COMPRESSION-62',
        brand: 'Motive',
        title: 'Motive Men Compression Shorts COS 62',
        category: 'quan-chay-bo',
        price: 485000,
        weight: 160,
        sizes: ['S', 'M', 'L', 'XL'],
        source: 'https://motive.vn/products/quan-the-thao-chay-bo-bo-co-nam-motive-men-compression-shorts-mau-den',
        description: 'Quần bó cơ sử dụng vải co giãn đa chiều nhằm ổn định chuyển động khi chạy road, trail hoặc tập trong nhà. Phần lưng điều chỉnh linh hoạt và tích hợp túi đai đủ chỗ cho điện thoại hoặc vật dụng nhỏ.'
    },
    {
        code: 'MOT-RACE-SINGLET-W',
        brand: 'Motive',
        title: 'Motive Woman Race Singlet 49g',
        category: 'ao-chay-bo',
        price: 379000,
        weight: 49,
        sizes: ['S', 'M', 'L', 'XL', '2XL'],
        source: 'https://motive.vn/products/ao-thun-the-thao-chay-bo-nu-motive-woman-race-singlet-49g-mau-xanh-la',
        description: 'Áo singlet chạy bộ nữ siêu nhẹ khoảng 49 g, dùng sợi tái chế và kỹ thuật cắt laser nhằm giảm đường may. Form dành riêng cho nữ, ưu tiên độ thoáng và hạn chế cọ xát trong tập luyện hoặc thi đấu đường dài.'
    }
].concat(expandedCatalog).filter(
    (product) => !unverifiedCatalogCodes.has(product.code)
)

function decodeHtml(value) {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
}

function findOpenGraphImage(html, pageUrl) {
    const metaTags = html.match(/<meta\s+[^>]*>/gi) || []

    for (const tag of metaTags) {
        if (!/(?:property|name)=["']og:image(?::secure_url)?["']/i.test(tag)) {
            continue
        }

        const match = tag.match(/content=["']([^"']+)["']/i)
        if (match) {
            return new URL(decodeHtml(match[1]), pageUrl).toString()
        }
    }

    throw new Error('Trang nguồn không cung cấp ảnh Open Graph')
}

function normalizeComparable(value) {
    return decodeHtml(String(value || ''))
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
}

function imageAttribute(tag, name) {
    const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, 'i'))
    return match?.[1] || ''
}

function findMatchingProductImage(html, pageUrl, productTitle) {
    const expectedTokens = normalizeComparable(productTitle)
        .split(' ')
        .filter((token) => token.length > 2)
    const candidates = (html.match(/<img\s+[^>]*>/gi) || []).map((tag) => {
        const alt = imageAttribute(tag, 'alt')
        const altTokens = new Set(normalizeComparable(alt).split(' '))
        const score = expectedTokens.reduce(
            (total, token) => total + (altTokens.has(token) ? 1 : 0),
            0
        )
        const rawUrl = imageAttribute(tag, 'data-src') ||
            imageAttribute(tag, 'data-lazy-src') ||
            imageAttribute(tag, 'data-original') ||
            imageAttribute(tag, 'src') ||
            imageAttribute(tag, 'srcset').split(',')[0]?.trim().split(/\s+/)[0]

        return { rawUrl, score }
    }).filter((candidate) => candidate.rawUrl && candidate.score >= 2)

    const bestCandidate = candidates.sort((left, right) => right.score - left.score)[0]
    if (!bestCandidate) return ''
    return new URL(decodeHtml(bestCandidate.rawUrl), pageUrl).toString()
}

function extensionForContentType(contentType) {
    if (contentType.includes('png')) return '.png'
    if (contentType.includes('webp')) return '.webp'
    if (contentType.includes('avif')) return '.avif'
    return '.jpg'
}

async function fetchWithTimeout(url, timeoutMs = 20000) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const response = await fetch(url, {
            redirect: 'follow',
            signal: controller.signal,
            headers: {
                'user-agent': 'Mozilla/5.0 RunStoreDemoCatalog/1.0',
                accept: 'text/html,image/avif,image/webp,image/png,image/jpeg,*/*'
            }
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`)
        }

        return response
    } finally {
        clearTimeout(timeout)
    }
}

async function downloadProductImage(product, ownerId) {
    let imageUrl = product.image

    if (!imageUrl) {
        const pageResponse = await fetchWithTimeout(product.source)
        const html = await pageResponse.text()
        imageUrl = findMatchingProductImage(html, product.source, product.title) ||
            findOpenGraphImage(html, product.source)
    }
    const imageResponse = await fetchWithTimeout(imageUrl)
    const contentType = imageResponse.headers.get('content-type') || ''

    if (!contentType.startsWith('image/')) {
        throw new Error('Nguồn trả về nội dung không phải hình ảnh')
    }

    const bytes = Buffer.from(await imageResponse.arrayBuffer())
    if (!bytes.length || bytes.length > 5 * 1024 * 1024) {
        throw new Error('Ảnh nguồn rỗng hoặc vượt quá 5 MB')
    }

    await fs.mkdir(productsDirectory, { recursive: true })
    const filename = [
        `product-${ownerId}-${Date.now()}`,
        crypto.randomBytes(6).toString('hex')
    ].join('-') + extensionForContentType(contentType)
    const filePath = path.join(productsDirectory, filename)

    await fs.writeFile(filePath, bytes)
    return {
        filePath,
        imageUrl: `${productsUrlPrefix}/${filename}`
    }
}

function buildConfiguration(product) {
    const options = product.sizes.length
        ? [{ code: 'size', name: 'Kích thước', values: product.sizes }]
        : []
    const variants = (product.sizes.length ? product.sizes : [null]).map(
        (size, index) => ({
            sku: `${product.code}-${size || 'DEFAULT'}`,
            option_values: size ? { size } : {},
            price: null,
            stock_quantity: 6 + ((index * 7 + product.code.length) % 18),
            image_index: 0,
            images: [],
            status: 'active'
        })
    )

    return { options, variants }
}

async function findDefaultOwner() {
    const owners = await Product.findAll({
        attributes: [
            'owner_id',
            [sequelize.fn('COUNT', sequelize.col('Product.id')), 'count']
        ],
        group: ['owner_id'],
        order: [[sequelize.literal('count'), 'DESC']],
        raw: true
    })
    const ownerId = owners[0]?.owner_id || (await User.findOne({
        order: [['id', 'ASC']]
    }))?.id

    if (!ownerId) throw new Error('Không tìm thấy tài khoản để sở hữu sản phẩm')
    return Number(ownerId)
}

async function main() {
    const ownerId = await findDefaultOwner()
    const categories = new Map((await Category.findAll({
        where: { status: 'active' }
    })).map((category) => [category.slug, category]))
    const result = { created: [], skipped: [], failed: [] }

    for (const product of catalog) {
        const configuration = buildConfiguration(product)
        const existingVariant = await ProductVariant.findOne({
            where: { sku: configuration.variants[0].sku }
        })

        if (existingVariant) {
            result.skipped.push(product.title)
            continue
        }

        const category = categories.get(product.category)
        if (!category) {
            result.failed.push({ title: product.title, error: 'Danh mục không tồn tại' })
            continue
        }

        let downloadedImage
        try {
            downloadedImage = await downloadProductImage(product, ownerId)
            await productService.createProduct(
                ownerId,
                {
                    title: product.title,
                    description: `${product.description}\n\nDữ liệu demo phục vụ bài tập; tên, thông số và hình ảnh tham khảo từ trang sản phẩm chính thức: ${product.source}`,
                    category_id: Number(category.id),
                    brand: product.brand,
                    price: product.price,
                    weight_grams: product.weight,
                    ...configuration
                },
                [downloadedImage.imageUrl],
                []
            )
            result.created.push(product.title)
        } catch (error) {
            if (downloadedImage?.filePath) {
                await fs.unlink(downloadedImage.filePath).catch(() => {})
            }
            result.failed.push({ title: product.title, error: error.message })
        }
    }

    console.log(JSON.stringify({ ownerId, ...result }, null, 2))
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => sequelize.close())
