const fixture = require('./helpers/seller-orders-search-fixture')
const { seed, cleanup, agents, orders, Customer, Order, shops } = fixture

async function search(q, options = {}) {
    const response = await agents[0].get('/api/shops/me/orders').query({ q, ...options })
    expect(response.status).toBe(200)
    return response.body
}

// Lưu dữ liệu ban đầu và luôn khôi phục, kể cả khi một assertion thất bại.
async function withNames(orderChanges, customerChanges, check) {
    const originals = []
    try {
        for (const [model, changes] of [[Order, orderChanges], [Customer, customerChanges]]) {
            for (const [id, values] of changes) {
                const row = await model.findByPk(id)
                const previous = Object.fromEntries(Object.keys(values).map(key => [key, row.get(key)]))
                originals.push([row, previous])
                await row.update(values)
            }
        }
        await check()
    } finally {
        for (const [row, values] of originals.reverse()) await row.update(values)
    }
}

describe('Test API tìm kiếm Order với từ khóa số và các tình huống phân trang', () => {
    // Chuẩn bị dữ liệu riêng và dọn dữ liệu sau khi chạy nhóm test.
    beforeAll(seed, 30000)
    afterAll(cleanup)

    it('Case 1 - Từ khóa số vẫn tìm trong tên đơn và tên khách hàng', async () => {
        const target = orders[0][0]
        const other = orders[2][0]
        const customer = await Customer.findByPk(other.customer_id)
        const previous = customer.first_name
        const number = String(target.id)
        try {
            // Cho cùng một số xuất hiện trong tên đơn và tên của khách khác.
            await customer.update({ first_name: `Customer ${number}` })
            await Order.update({ order_name: `Number ${number}` }, { where: { id: target.id } })
            const result = await search(number)
            const expected = orders.map(group => group[0])
                .filter(row => row.id === target.id || row.id === other.id || row.order_name.includes(number))
                .map(row => row.id)
            expect(result.data.map(row => row.id).sort()).toEqual(expected.sort())
        } finally {
            // Khôi phục tên để không ảnh hưởng các test tiếp theo.
            await customer.update({ first_name: previous })
            await Order.update({ order_name: target.order_name }, { where: { id: target.id } })
        }
    })

    it('Case 2 - Không tìm theo ID khi tên đơn và tên khách không chứa chữ số', async () => {
        const original = orders.flat()
        try {
            // Đổi tên đơn thành chữ để chắc chắn ID không trùng chuỗi trong tên.
            for (const [index, row] of original.entries()) {
                await Order.update({ order_name: `Alphabet ${String.fromCharCode(65 + index)}` }, { where: { id: row.id } })
            }
            for (const q of [String(orders[0][0].id), String(orders[0][0].customer_id), `#${orders[0][0].id}`]) {
                expect((await search(q)).data).toEqual([])
            }
        } finally {
            for (const row of original) {
                await Order.update({ order_name: row.order_name }, { where: { id: row.id } })
            }
        }
    })

    it('Case 3 - Giữ bộ lọc và tổng số kết quả khi trang tiếp theo không có đơn', async () => {
        const name = orders[1][0].order_name
        const paid = await search(name, { financial_status: 'paid', limit: 1 })
        expect(paid.data.map(row => row.id)).toEqual([orders[1][0].id])
        expect(paid.pagination).toMatchObject({ totalItems: 1, totalPages: 1 })
        expect((await search(name, { financial_status: 'unpaid' })).data).toEqual([])
        const next = await search(name, { financial_status: 'paid', limit: 1, page: 2 })
        expect(next.data).toEqual([])
        expect(next.pagination).toMatchObject({ totalItems: 1, totalPages: 1, page: 2 })
    })

    it('Case 4 - Xóa từ khóa sẽ lấy lại danh sách đơn trong shop hiện tại', async () => {
        expect((await search(orders[0][0].order_name)).pagination.totalItems).toBe(1)
        expect((await search('')).pagination.totalItems).toBe(3)
    })

    it.each([undefined, '', '   ', '\t\n'])('Case 5 - Từ khóa rỗng "%s" trả toàn bộ đơn thuộc shop', async q => {
        const result = await search(q)
        expect(result.pagination.totalItems).toBe(3)
        expect(result.data.map(row => row.id).sort()).toEqual(orders.map(group => group[0].id).sort())
    })

    it('Case 6 - Chấp nhận tên đơn có đúng 100 ký tự', async () => {
        const name = 'A'.repeat(100)
        await withNames([[orders[0][0].id, { order_name: name }]], [], async () => {
            expect((await search(name)).data.map(row => row.id)).toEqual([orders[0][0].id])
        })
    })

    it.each([
        ['101 ký tự', { q: 'A'.repeat(101) }],
        ['mảng từ khóa', { q: ['Search', 'Customer'] }],
        ['object từ khóa', { q: { term: 'Search' } }],
        ['tham số không hỗ trợ', { q: 'Search', unsupported: 'value' }],
        ['trang bằng 0', { q: 'Search', page: 0 }],
        ['trang âm', { q: 'Search', page: -1 }],
        ['trang không nguyên', { q: 'Search', page: 1.5 }],
        ['limit vượt 100', { q: 'Search', limit: 101 }],
        ['limit bằng 0', { q: 'Search', limit: 0 }],
        ['sort không hợp lệ', { q: 'Search', sort: 'invalid' }],
        ['trạng thái đơn không hợp lệ', { q: 'Search', order_status: 'invalid' }]
    ])('Case 7 - Trả lỗi 400 với đầu vào %s', async (_label, query) => {
        const response = await agents[0].get('/api/shops/me/orders').query(query)
        expect(response.status).toBe(400)
    })

    it('Case 8 - Nhiều đơn cùng tên trả đủ kết quả và phân trang không lặp', async () => {
        const ownIds = orders.map(group => group[0].id)
        await withNames(ownIds.map(id => [id, { order_name: 'Same Order Name' }]), [], async () => {
            const found = []
            for (let page = 1; page <= 3; page++) {
                const result = await search('Same Order Name', { page, limit: 1, sort: 'oldest' })
                expect(result.pagination).toMatchObject({ totalItems: 3, totalPages: 3 })
                found.push(...result.data.map(row => row.id))
            }
            expect(new Set(found).size).toBe(3)
            expect(found.sort()).toEqual(ownIds.sort())
        })
    })

    it('Case 9 - Một đơn khớp cả tên Order và Customer vẫn chỉ xuất hiện một lần', async () => {
        const target = orders[0][0]
        await withNames([[target.id, { order_name: 'DoubleMatch Order' }]],
            [[target.customer_id, { first_name: 'DoubleMatch' }]], async () => {
                const result = await search('DoubleMatch')
                expect(result.pagination.totalItems).toBe(1)
                expect(result.data.map(row => row.id)).toEqual([target.id])
            })
    })

    it('Case 10 - Hai shop có tên đơn giống nhau vẫn chỉ trả đơn của shop đăng nhập', async () => {
        const own = orders[0][0], foreign = orders[0][1]
        await withNames([[own.id, { order_name: 'Shared Shop Name' }],
            [foreign.id, { order_name: 'Shared Shop Name' }]], [], async () => {
            expect((await search('Shared Shop Name')).data.map(row => row.id)).toEqual([own.id])
            const other = await agents[1].get('/api/shops/me/orders').query({ q: 'Shared Shop Name' })
            expect(other.status).toBe(200)
            expect(other.body.data.map(row => row.id)).toEqual([foreign.id])
        })
    })

    it.each(['%', '_', '\\', "'", 'Đơn hàng Nguyễn Văn An', 'Case+Order#'])(
        'Case 11 - Tìm đúng ký tự và tên Unicode "%s" trong order_name', async keyword => {
        const target = orders[0][0]
        // Thay mọi tên đơn để chỉ một bản ghi chứa ký tự được kiểm tra.
        const changes = orders.flat().map(row => [row.id,
            { order_name: row.id === target.id ? `Special ${keyword} End` : 'Plain Order' }])
        await withNames(changes, [], async () => {
            const result = await search(`Special ${keyword} End`)
            expect(result.data.map(row => row.id)).toEqual([target.id])
            expect(result.data[0].order_name).toBe(`Special ${keyword} End`)
        })
    })

    it.each([
        ['pending', 'unpaid', 'unfulfilled'],
        ['confirmed', 'paid', 'delivered'],
        ['cancelled', 'unpaid', 'cancelled']
    ])('Case 12 - Search giữ đồng thời bộ lọc %s %s %s', async (status, payment, fulfillment) => {
        const target = orders[0][0]
        await withNames([[target.id, { status, payment_status: payment, fulfillment_status: fulfillment }]], [], async () => {
            const result = await search(target.order_name, { order_status: status,
                financial_status: payment, fulfillment_status: fulfillment })
            expect(result.data.map(row => row.id)).toEqual([target.id])
            expect((await search(target.order_name, { financial_status: payment === 'paid' ? 'unpaid' : 'paid' })).data).toEqual([])
        })
    })

    it.each(['newest', 'oldest', 'total_desc', 'total_asc'])(
        'Case 13 - Sắp xếp %s ổn định khi thời gian và tổng tiền bằng nhau', async sort => {
        const ids = orders.map(group => group[0].id)
        await withNames(ids.map(id => [id, { order_name: 'Tie Order', order_total: '130000.00',
            created_at: new Date('2026-01-01T00:00:00Z') }]), [], async () => {
            const found = []
            for (let page = 1; page <= 3; page++) {
                found.push(...(await search('Tie Order', { sort, page, limit: 1 })).data.map(row => row.id))
            }
            const expected = ids.sort((a, b) => sort === 'oldest' ? a - b : b - a)
            expect(found).toEqual(expected)
        })
    })

    it.each(['order_code', 'order_total', 'status'])('Case 14 - Không tìm riêng theo trường %s', async field => {
        const target = orders[0][0]
        const row = await Order.findByPk(target.id)
        // Tên chỉ gồm chữ để số tiền không vô tình khớp tên đơn.
        await withNames(orders.flat().map(order => [order.id, { order_name: 'Plain Name' }]), [], async () => {
            expect((await search(String(row.get(field)))).data).toEqual([])
        })
    })

    it('Case 15 - Search bị từ chối khi shop bị đình chỉ', async () => {
        const { Shop } = require('../src/models')
        const shop = await Shop.findByPk(shops[0].id)
        try {
            await shop.update({ status: 'suspended' })
            const response = await agents[0].get('/api/shops/me/orders').query({ q: 'Search' })
            expect(response.status).toBe(403)
        } finally {
            await shop.update({ status: 'active' })
        }
    })

    it('Case 16 - Order nhiều sản phẩm không bị lặp dòng hoặc đếm sai kết quả', async () => {
        const { OrderItem, ProductVariant } = require('../src/models')
        const target = orders[0][0]
        const original = await OrderItem.findOne({ where: { order_id: target.id } })
        const values = original.toJSON()
        delete values.id
        delete values.createdAt
        delete values.updatedAt
        let extra, variant
        try {
            // Mỗi dòng dùng một variant riêng vì order_id + product_variant_id là unique.
            variant = await ProductVariant.create({ product_id: original.product_id,
                sku: `SEARCH-EXTRA-${target.id}`, variant_key: 'search-extra',
                price: original.unit_price, stock_quantity: 10, status: 'active', is_default: false })
            extra = await OrderItem.create({ ...values, product_variant_id: variant.id,
                sku: variant.sku, quantity: 2, line_total: '200000.00' })
            const result = await search(target.order_name, { limit: 1 })
            expect(result.pagination).toMatchObject({ totalItems: 1, totalPages: 1 })
            expect(result.data).toHaveLength(1)
            expect(result.data[0].item_quantity).toBe(Number(original.quantity) + 2)
        } finally {
            if (extra) await extra.destroy()
            if (variant) await variant.destroy()
        }
    })
})
