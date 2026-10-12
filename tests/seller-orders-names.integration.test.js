const request = require('supertest')
const fixture = require('./helpers/seller-orders-search-fixture')
const { seed, cleanup, app, agents, shops, orders, Customer, OrderAddress } = fixture

async function search(q, options = {}, seller = 0) {
    // Gọi API bằng phiên đăng nhập của người bán và gửi từ khóa cùng bộ lọc.
    const response = await agents[seller].get('/api/shops/me/orders').query({ q, ...options })
    expect(response.status).toBe(200)
    return response.body
}

describe('Test API tìm kiếm Order theo tên đơn hàng và tên Customer', () => {
    // Tạo dữ liệu trước khi chạy và xóa dữ liệu test sau khi hoàn thành.
    beforeAll(seed, 30000)
    afterAll(cleanup)

    it('Case 1 - Trả đúng tên đơn và tên khách hàng liên kết với Order', async () => {
        for (const group of orders) {
            const target = group[0]
            // Đọc Customer theo khóa ngoại để đối chiếu tên API trả về.
            const customer = await Customer.findByPk(target.customer_id)
            const result = await search(target.order_name)
            expect(result.data).toHaveLength(1)
            expect(result.data[0]).toMatchObject({ id: target.id, order_name: target.order_name,
                customer_name: `${customer.first_name} ${customer.last_name}`, shop_id: shops[0].id })
        }
    })

    it.each(['Search', 'Customer', 'Search Customer', '  Search Customer  '])('Case 2 - Tìm theo tên họ hoặc họ tên khách hàng với từ khóa "%s"', async q => {
        const result = await search(q)
        expect(result.data.map(row => row.id).sort()).toEqual([orders[0][0].id, orders[1][0].id].sort())
    })

    it('Case 3 - Tìm theo tên Customer và không tìm theo tên người nhận hàng', async () => {
        // Cố tình đổi tên người nhận để phân biệt customers với order_addresses.
        const snapshot = await OrderAddress.findOne({ where: { order_id: orders[0][0].id } })
        await snapshot.update({ recipient_first_name: 'SnapshotOnly', recipient_last_name: 'RecipientOnly' })
        expect((await search('SnapshotOnly')).data).toEqual([])
        expect((await search('Search Customer')).data.map(row => row.id)).toContain(orders[0][0].id)
    })

    it('Case 4 - Tìm một phần tên đơn và chỉ trả đơn trong shop hiện tại', async () => {
        const result = await search(`#pl${fixture.users[0].id}_`)
        expect(result.pagination.totalItems).toBe(3)
        expect(result.data.every(row => row.shop_id === shops[0].id)).toBe(true)
    })

    it('Case 5 - Không dùng ID đơn ID khách hàng hoặc order_code làm trường tìm kiếm', async () => {
        for (const q of [`#${orders[0][0].id}`, orders[0][0].order_code]) {
            expect((await search(q)).data).toEqual([])
        }
        // Chọn ID không xuất hiện trong tên đơn để tránh nhầm với tìm chuỗi tên.
        for (const key of ['id', 'customer_id']) {
            const target = orders.flat().find(row => !orders.flat().some(candidate => candidate.order_name.includes(String(row[key]))))
            expect(target).toBeDefined()
            expect((await search(String(target[key]))).data).toEqual([])
        }
    })

    it.each(['%', '_', 'Literal%_ Name'])('Case 6 - Tìm ký tự "%s" theo nghĩa thật thay vì ký tự đại diện SQL', async q => {
        const result = await search(q)
        const expected = q === '_' ? orders.map(group => group[0].id) : [orders[2][0].id]
        // Dấu _ có trong mọi tên đơn; dấu % chỉ có trong tên khách đặc biệt.
        expect(result.data.map(row => row.id).sort()).toEqual(expected.sort())
    })

    it('Case 7 - Không trả đơn của shop khác dù từ khóa khớp tên đơn', async () => {
        const foreign = orders[0][1]
        expect((await search(foreign.order_name)).data).toEqual([])
        expect((await search(foreign.order_name, {}, 1)).data.map(row => row.id)).toEqual([foreign.id])
    })

    it('Case 8 - Giữ bộ lọc thanh toán sắp xếp và phân trang khi tìm tên', async () => {
        // Hai đơn cùng tên khách được sắp theo tổng tiền giảm dần, mỗi trang một đơn.
        const result = await search('Search Customer', { sort: 'total_desc', limit: 1, page: 1 })
        expect(result.data.map(row => row.id)).toEqual([orders[1][0].id])
        expect(result.pagination).toMatchObject({ totalItems: 2, totalPages: 2 })
        expect((await search('Search Customer', { limit: 1, page: 2, sort: 'total_desc' })).data.map(row => row.id))
            .toEqual([orders[0][0].id])
        expect((await search('Search Customer', { financial_status: 'paid' })).data.map(row => row.id))
            .toEqual([orders[1][0].id])
    })

    it('Case 9 - Trả danh sách rỗng khi tên không tồn tại hoặc nhập chuỗi giống SQL', async () => {
        for (const q of ['Unknown Customer', "' OR 1=1 --"]) {
            const result = await search(q)
            expect(result.data).toEqual([])
            expect(result.pagination.totalItems).toBe(0)
        }
    })

    it('Case 10 - Từ chối yêu cầu chưa đăng nhập hoặc từ khóa quá 100 ký tự', async () => {
        expect((await request(app).get('/api/shops/me/orders')).status).toBe(401)
        expect((await agents[0].get('/api/shops/me/orders').query({ q: 'a'.repeat(101) })).status).toBe(400)
    })
})
