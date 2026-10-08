jest.mock('../src/models', () => ({
    Shop: { findOne: jest.fn() }, Order: { findAndCountAll: jest.fn() },
    OrderItem: {}, OrderAddress: {}, OrderEvent: {}, Product: {}, ProductVariant: {}
}))

const { Shop, Order } = require('../src/models')
const { listOrders } = require('../src/services/seller-orders.service')
const { listSellerOrdersSchema } = require('../src/validators/orders.validator')
const { Op } = require('sequelize')
const sequelize = require('../src/config/database')

describe('Seller order sorting before pagination', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        Shop.findOne.mockResolvedValue({ id: 7, status: 'active' })
        Order.findAndCountAll.mockResolvedValue({ rows: [], count: 0 })
    })
    it.each(['Minh Anh', 'Order ORD-test', '#0012', '50%_off'])('searches %s within the owned shop', async q => {
        const { value, error } = listSellerOrdersSchema.validate({ q })
        expect(error).toBeUndefined()
        await listOrders(42, value)
        const query = Order.findAndCountAll.mock.calls[0][0]
        expect(query.where.shop_id).toBe(7)
        const sql = sequelize.getQueryInterface().queryGenerator.selectQuery('Orders', { where: query.where })
        expect(sql).not.toContain('order_name')
        expect(sql).not.toContain('order_code')
        if (q === '#0012') {
            expect(query.where).toEqual({ shop_id: 7, id: 12 })
        } else {
            expect(sql).toContain('CONCAT_WS')
            expect(sql).toContain('recipient_first_name')
            expect(sql).toContain('recipient_last_name')
        }
        if (q === '50%_off') expect(query.where[Op.or][0]['$address.recipient_first_name$'][Op.like]).toBe('%50\\%\\_off%')
    })
    it.each([
        ['newest', [['created_at', 'DESC'], ['id', 'DESC']]],
        ['oldest', [['created_at', 'ASC'], ['id', 'ASC']]],
        ['total_desc', [['order_total', 'DESC'], ['id', 'DESC']]],
        ['total_asc', [['order_total', 'ASC'], ['id', 'DESC']]]
    ])('keeps shop scope and applies %s in the database query', async (sort, order) => {
        const { value, error } = listSellerOrdersSchema.validate({ sort, page: 2, limit: 10,
            financial_status: 'paid', fulfillment_status: 'delivered' })
        expect(error).toBeUndefined()
        await listOrders(42, value)
        expect(Shop.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { owner_user_id: 42 } }))
        expect(Order.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
            where: { shop_id: 7, payment_status: 'paid', fulfillment_status: 'delivered' },
            order, limit: 10, offset: 10
        }))
    })
})
