const request = require('supertest')
const { v4: uuid } = require('uuid')
const fixture = require('./helpers/seller-orders-search-fixture')
const { Product, ProductVariant, ShippingMethod, OrderItem, CheckoutToken } = require('../src/models')
const { seed, cleanup, app, agents, orders, users, shops, Customer, Order, OrderAddress, variants, rates } = fixture

// Fixture dùng chung chỉ chuẩn bị dữ liệu nền và các khóa ngoại bắt buộc.
// Mỗi lần gọi sẽ tạo order mới; dữ liệu trọng tâm và expected nằm ngay trong từng case.
async function prepareOrder(orderData = {}, itemData = null, addressData = {}) {
    const Order_Mau = await Order.findByPk(orders[0][0].id)
    const Address_Mau = await OrderAddress.findOne({ where: { order_id: Order_Mau.id } })
    const Item_Mau = await OrderItem.findOne({ where: { order_id: Order_Mau.id } })
    const Checkout_Mau = await CheckoutToken.findByPk(Order_Mau.checkout_id)
    const orderFields = Order_Mau.toJSON()
    const addressFields = Address_Mau.toJSON()
    const itemFields = Item_Mau.toJSON()
    const checkoutFields = Checkout_Mau.toJSON()
    for (const fields of [orderFields, addressFields, itemFields, checkoutFields]) {
        for (const key of ['id', 'created_at', 'updated_at', 'createdAt', 'updatedAt']) delete fields[key]
    }
    // Mỗi order có checkout riêng để tuân thủ unique checkout_id và shop_id.
    const Checkout_Data = await CheckoutToken.create({ ...checkoutFields,
        checkout_token: uuid(), request_id: uuid(), order_request_id: uuid() })
    const Order_Data = await Order.create({ ...orderFields, checkout_id: Checkout_Data.id,
        order_name: `test-${uuid()}`, order_code: `TEST-${uuid()}`, ...orderData })
    // Form hiện tại chỉ nhập city, province, country và zip code.
    // Các cột địa chỉ cũ vẫn tồn tại nhưng không thuộc dữ liệu đang kiểm tra.
    const Address_Data = await OrderAddress.create({ ...addressFields,
        street: '', house_number: null, apartment: null, ward: null,
        ...addressData, order_id: Order_Data.id })
    const Item_Data = []
    for (const item of itemData || [{ product_name: 'Giày test chi tiết đơn', quantity: 1 }]) {
        const saved = await OrderItem.create({ ...itemFields, ...item, order_id: Order_Data.id })
        Item_Data.push(saved.toJSON())
    }
    await Address_Data.reload()
    return { ...Order_Data.toJSON(), address: JSON.parse(JSON.stringify(Address_Data)), items: Item_Data }
}

describe('Test API chi tiết đơn hàng người bán - GET /api/shops/me/orders/:id', () => {
    beforeAll(seed, 30000)
    afterAll(cleanup)
    const path = id => `/api/shops/me/orders/${id}`

    it('Case 1 - Trả đúng order name của đơn đã chuẩn bị', async () => {
        // Prepare: tạo order riêng và xác định tên mong đợi trước khi gọi GET.
        const order_name = `test-ten-don-${uuid()}`
        const Order_Data = await prepareOrder({ order_name })

        // Input: truyền order_id trên URL; agent đã có cookie của chủ shop.
        const order_id = Order_Data.id
        const res_order = await agents[0].get(`/api/shops/me/orders/${order_id}`)

        // Output expected.
        expect(res_order.status).toBe(200)
        expect(res_order.body.success).toBe(true)
        expect(res_order.body.data.id).toBe(order_id)
        expect(res_order.body.data.order_name).toBe(order_name)
    })

    it('Case 2 - Trả đúng product tên sản phẩm và quantity của từng item', async () => {
        // Prepare: hai variant cùng shop, có tên và quantity khác nhau.
        const Variant_Data = await ProductVariant.create({
            product_id: variants[0].product_id, sku: `DETAIL-${uuid()}`,
            variant_key: `detail-${uuid()}`, price: '150000.00', stock_quantity: 20,
            status: 'active', is_default: false
        })
        const Order_Data = await prepareOrder({}, [
            { product_id: variants[0].product_id, product_variant_id: variants[0].id,
                product_name: 'Giày chạy bộ đen', quantity: 2 },
            { product_id: Variant_Data.product_id, product_variant_id: Variant_Data.id,
                product_name: 'Giày chạy bộ trắng', quantity: 3 }
        ])

        // Input.
        const order_id = Order_Data.id
        const res_order = await agents[0].get(`/api/shops/me/orders/${order_id}`)

        // Output expected: tìm theo variant để không phụ thuộc thứ tự mảng.
        expect(res_order.status).toBe(200)
        expect(res_order.body.success).toBe(true)
        expect(res_order.body.data.id).toBe(order_id)
        expect(res_order.body.data.items).toHaveLength(2)
        const Item_Den = res_order.body.data.items.find(item => item.product_variant_id === variants[0].id)
        const Item_Trang = res_order.body.data.items.find(item => item.product_variant_id === Variant_Data.id)
        expect(Item_Den).toBeDefined()
        expect(Item_Den.product_id).toBe(variants[0].product_id)
        expect(Item_Den.product_name).toBe('Giày chạy bộ đen')
        expect(Item_Den.quantity).toBe(2)
        expect(Item_Trang).toBeDefined()
        expect(Item_Trang.product_id).toBe(Variant_Data.product_id)
        expect(Item_Trang.product_name).toBe('Giày chạy bộ trắng')
        expect(Item_Trang.quantity).toBe(3)
    })

    it('Case 3 - Trả đúng tên email và phone khách hàng trong address', async () => {
        // Prepare.
        const Order_Data = await prepareOrder({}, null, {
            recipient_first_name: 'An', recipient_last_name: 'Nguyễn',
            email: 'an@example.com', phone: '0901234567'
        })

        // Input.
        const order_id = Order_Data.id
        const res_order = await agents[0].get(`/api/shops/me/orders/${order_id}`)

        // Output expected.
        expect(res_order.status).toBe(200)
        expect(res_order.body.success).toBe(true)
        expect(res_order.body.data.id).toBe(order_id)
        expect(res_order.body.data.address.recipient_first_name).toBe('An')
        expect(res_order.body.data.address.recipient_last_name).toBe('Nguyễn')
        expect(res_order.body.data.address.email).toBe('an@example.com')
        expect(res_order.body.data.address.phone).toBe('0901234567')
    })

    it('Case 4 - Trả đúng người nhận địa chỉ và phương thức vận chuyển', async () => {
        // Prepare.
        const Order_Data = await prepareOrder({ shipping_method_name: 'Express' }, null, {
            recipient_first_name: 'Bình', recipient_last_name: 'Trần', phone: '0912345678',
            city: 'Kinh Môn', province_name: 'Hải Dương', postal_code: '03127', country_name: 'Việt Nam'
        })

        // Input.
        const order_id = Order_Data.id
        const res_order = await agents[0].get(`/api/shops/me/orders/${order_id}`)

        // Output expected.
        expect(res_order.status).toBe(200)
        expect(res_order.body.success).toBe(true)
        expect(res_order.body.data.id).toBe(order_id)
        expect(res_order.body.data.address.recipient_first_name).toBe('Bình')
        expect(res_order.body.data.address.recipient_last_name).toBe('Trần')
        expect(res_order.body.data.address.phone).toBe('0912345678')
        expect(res_order.body.data.address.city).toBe('Kinh Môn')
        expect(res_order.body.data.address.province_name).toBe('Hải Dương')
        expect(res_order.body.data.address.postal_code).toBe('03127')
        expect(res_order.body.data.address.country_name).toBe('Việt Nam')
        expect(res_order.body.data.shipping_method_name).toBe('Express')
    })

    it('Case 5 - Trả đúng subtotal phí ship và tổng toàn bộ đơn', async () => {
        // Prepare: 2 x 100000 + 1 x 150000 = 350000; cộng 30000 ship = 380000.
        const Variant_Data = await ProductVariant.create({
            product_id: variants[0].product_id, sku: `TOTAL-${uuid()}`,
            variant_key: `total-${uuid()}`, price: '150000.00', stock_quantity: 20,
            status: 'active', is_default: false
        })
        const Order_Data = await prepareOrder({
            sub_total: '350000.00', shipping_fee: '30000.00', order_total: '380000.00'
        }, [
            { product_name: 'Giày chạy bộ', quantity: 2, unit_price: '100000.00', line_total: '200000.00' },
            { product_variant_id: Variant_Data.id, sku: Variant_Data.sku,
                product_name: 'Giày chạy bộ trắng', quantity: 1, unit_price: '150000.00', line_total: '150000.00' }
        ])

        // Input.
        const order_id = Order_Data.id
        const res_order = await agents[0].get(`/api/shops/me/orders/${order_id}`)

        // Output expected: dùng giá trị đã biết từ prepare, không lấy response làm expected.
        expect(res_order.status).toBe(200)
        expect(res_order.body.success).toBe(true)
        expect(res_order.body.data.id).toBe(order_id)
        expect(res_order.body.data.sub_total).toBe('350000.00')
        expect(res_order.body.data.shipping_fee).toBe('30000.00')
        expect(res_order.body.data.order_total).toBe('380000.00')
    })

    it('Case 6 - Không trả trường riêng tư hoặc items của đơn khác', async () => {
        const Order_A = await prepareOrder({}, [{ product_name: 'Sản phẩm đơn A', quantity: 2 }])
        await prepareOrder({}, [{ product_name: 'Sản phẩm đơn B', quantity: 5 }])
        const res_order = await agents[0].get(`/api/shops/me/orders/${Order_A.id}`)
        expect(res_order.status).toBe(200)
        expect(res_order.body.data.items).toHaveLength(1)
        expect(res_order.body.data.items[0].product_name).toBe('Sản phẩm đơn A')
        expect(res_order.body.data.items[0].quantity).toBe(2)
        expect(res_order.body.data).not.toHaveProperty('checkout_id')
        expect(res_order.body.data).not.toHaveProperty('user_id')
        expect(res_order.body.data).not.toHaveProperty('customer_id')
        expect(res_order.body.data).not.toHaveProperty('customer')
    })

    it.each(['abc', '0', '-1', '1.5', '9007199254740992', '1 OR 1=1'])(
        'Case 7 - Từ chối order ID không hợp lệ là %s', async id => {
            const response = await agents[0].get(path(encodeURIComponent(id)))
            expect(response.status).toBe(400)
            expect(response.body.success).toBe(false)
            expect(response.body).not.toHaveProperty('data')
        }
    )

    it('Case 8 - Không cho xem đơn shop khác đơn không tồn tại hoặc chưa đăng nhập', async () => {
        const missingId = Number.MAX_SAFE_INTEGER
        expect(await Order.findByPk(missingId)).toBeNull()
        for (const id of [orders[0][1].id, missingId]) {
            const response = await agents[0].get(path(id))
            expect(response.status).toBe(404)
            expect(response.body).toEqual({ success: false, message: 'Order not found', code: 'ORDER_NOT_FOUND' })
        }
        expect((await request(app).get(path(orders[0][0].id))).status).toBe(401)
    })

    it('Case 9 - Giữ dữ liệu lịch sử khi khách sản phẩm giá và vận chuyển thay đổi', async () => {
        const expected = await prepareOrder()
        const customer = await Customer.findByPk(expected.customer_id)
        const product = await Product.findByPk(variants[0].product_id)
        const method = await ShippingMethod.findByPk(expected.shipping_method_id)
        const original = { first_name: customer.first_name, title: product.title,
            price: variants[0].price, method_name: method.name, fee: rates[0].fixed_fee }
        try {
            await customer.update({ first_name: 'Changed customer' })
            await product.update({ title: 'Changed product' })
            await variants[0].update({ price: '123456.78' })
            await method.update({ name: 'Changed shipping' })
            await rates[0].update({ fixed_fee: '99999.99' })
            const response = await agents[0].get(path(expected.id))
            expect(response.status).toBe(200)
            expect(response.body.data).toMatchObject({ address: {
                recipient_first_name: expected.address.recipient_first_name,
                recipient_last_name: expected.address.recipient_last_name,
                email: expected.address.email,
                phone: expected.address.phone,
                city: expected.address.city,
                province_name: expected.address.province_name,
                postal_code: expected.address.postal_code,
                country_name: expected.address.country_name
            },
                shipping_method_name: expected.shipping_method_name,
                sub_total: expected.sub_total, shipping_fee: expected.shipping_fee, order_total: expected.order_total })
            expect(response.body.data.items).toEqual(expect.arrayContaining(expected.items.map(item => expect.objectContaining({
                id: item.id, product_name: item.product_name, unit_price: item.unit_price, line_total: item.line_total
            }))))
        } finally {
            await customer.update({ first_name: original.first_name })
            await product.update({ title: original.title })
            await variants[0].update({ price: original.price })
            await method.update({ name: original.method_name })
            await rates[0].update({ fixed_fee: original.fee })
        }
    })

    it('Case 10 - Trả đúng province và zip code null phí ship bằng 0 và GET không sửa order', async () => {
        const expected = await prepareOrder()
        const address = await OrderAddress.findOne({ where: { order_id: expected.id } })
        const fields = { province_name: null, postal_code: null }
        await address.update(fields)
        await Order.update({ shipping_fee: '0.00', order_total: expected.sub_total }, { where: { id: expected.id } })
        const before = (await Order.findByPk(expected.id)).toJSON()
        for (let attempt = 0; attempt < 2; attempt++) {
            const response = await agents[0].get(path(expected.id))
            expect(response.status).toBe(200)
            expect(response.body.data).toMatchObject({ address: fields, shipping_fee: '0.00', order_total: expected.sub_total })
        }
        expect((await Order.findByPk(expected.id)).toJSON()).toEqual(before)
    })

    it('Case 11 - Từ chối shop đình chỉ và tài khoản không hoạt động dù đã đăng nhập', async () => {
        const Order_Data = await prepareOrder()
        const id = Order_Data.id
        try {
            await shops[0].update({ status: 'suspended' })
            expect((await agents[0].get(path(id))).status).toBe(403)
            await shops[0].update({ status: 'active' })
            await users[0].update({ status: 'inactive' })
            const response = await agents[0].get(path(id))
            expect(response.status).toBe(403)
            expect(response.body).toEqual({ success: false, message: 'Account is not active' })
            expect((await agents[0].get(path(id))).status).toBe(401)
        } finally {
            await shops[0].update({ status: 'active' })
            await users[0].update({ status: 'active' })
        }
    })
})
