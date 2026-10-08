const sequelize = require('../src/config/database')
const {
    Product
} = require('../src/models')

const removedTitles = [
    'Giày chạy bộ',
    'Set đồ tập thể thao nữ 2 - Trắng Đen',
    'Áo Tanktop cầu lông nam Slide Flow Smash Energy',
    'Motive IRONMAN 70.3 Event Logo Tee 2026',
    'Motive IRONMAN 140.6 Event Logo Tee 2026',
    'Motive IRONKIDS Event Bucket Hat',
    'Motive K-Dot Bucket Hat',
    'Motive IRONMAN Jogger 2026',
    'Motive IRONMAN Hoodie 2026',
    'Motive IRONMAN 1/4 Zip Long Sleeves 2026',
    'Motive IRONMAN K-Dot Tee 2026',
    'Motive IRONMAN Singlet 2026'
]

async function main() {
    const products = await Product.findAll({
        paranoid: false,
        where: { title: removedTitles },
        attributes: ['id', 'title']
    })
    const productIds = products.map((product) => product.id)

    await sequelize.transaction(async (transaction) => {
        if (productIds.length) {
            await Product.destroy({
                where: { id: productIds },
                transaction
            })
        }

        await Product.update({
            title: 'Quần Shorts Chạy Bộ 7 inch Đa Năng',
            description: 'Quần chạy 7 inch cân bằng giữa độ che phủ và khả năng vận động. Chất vải co giãn, nhanh khô và form linh hoạt phù hợp chạy nền, recovery hoặc chạy đường dài.\n\nDữ liệu demo phục vụ bài tập; thông tin tham khảo từ danh mục chạy bộ Coolmate.'
        }, {
            where: { title: 'Quần Shorts thể thao 7 inch đa năng' },
            transaction
        })

        await Product.update({
            title: 'Áo thun chạy bộ nam Heartbeat ExDry Advance Motion',
            brand: 'Coolmate'
        }, {
            where: { title: 'Tshirt chạy bộ nam Heartbeat Exdry Advance Motion' },
            transaction
        })
    })

    console.log(JSON.stringify({
        archived: products.map((product) => product.title),
        missing: removedTitles.filter((title) => (
            !products.some((product) => product.title === title)
        ))
    }, null, 2))
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(() => sequelize.close())
