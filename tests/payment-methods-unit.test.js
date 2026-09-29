jest.mock('../src/config/database', () => ({ transaction: jest.fn(fn => fn({ LOCK: { UPDATE: 'UPDATE' } })) }))
jest.mock('../src/models', () => ({ PaymentMethod: { findAll: jest.fn(), findOne: jest.fn() }, Shop: { findAll: jest.fn(), findOne: jest.fn() } }))
jest.mock('../src/services/products.service', () => ({ validatePurchaseItems: jest.fn() }))
const { PaymentMethod, Shop } = require('../src/models')
const { getPaymentOptions } = require('../src/services/checkout.service')
const { getPaymentMethod, updatePaymentMethod, deletePaymentMethod } = require('../src/services/payment-methods.service')

beforeEach(() => {
    jest.resetAllMocks()
    require('../src/config/database').transaction.mockImplementation(fn => fn({ LOCK: { UPDATE: 'UPDATE' } }))
})
describe('Payment options and ownership without database writes', () => {
    it('preserves separate instructions for each shop and uses a common COD label', async () => {
        Shop.findAll.mockResolvedValue([{ id: 1, owner_user_id: 11, name: 'Shop A' }, { id: 2, owner_user_id: 22, name: 'Shop B' }])
        PaymentMethod.findAll.mockResolvedValue([
            { id: 7, user_id: 11, name: 'A COD', payment_data: { type: 'cod', instructions: 'A instructions' } },
            { id: 8, user_id: 22, name: 'B COD', payment_data: { type: 'cod', instructions: 'B instructions' } }
        ])
        const [option] = await getPaymentOptions([1, 2])
        expect(option.name).toBe('Cash on delivery')
        expect(option.payment_data.instructions).toBeNull()
        expect(option.shop_details.map(shop => shop.instructions)).toEqual(['A instructions', 'B instructions'])
        expect(option.method_ids).toEqual({ 1: 7, 2: 8 })
        expect(PaymentMethod.findAll.mock.calls[0][0].where).toMatchObject({ is_active: true, is_deleted: false })
    })
    it('offers no payment when one shop does not support COD', async () => {
        Shop.findAll.mockResolvedValue([{ id: 1, owner_user_id: 11 }, { id: 2, owner_user_id: 22 }])
        PaymentMethod.findAll.mockResolvedValue([{ id: 7, user_id: 11, payment_data: { type: 'cod' } }])
        expect(await getPaymentOptions([1, 2])).toEqual([])
    })
    it.each([getPaymentMethod, updatePaymentMethod, deletePaymentMethod])('scopes record access to the authenticated owner', async action => {
        Shop.findOne.mockResolvedValue({ status: 'active' })
        PaymentMethod.findOne.mockResolvedValue(null)
        await expect(action(11, 99, { name: 'Not mine' })).rejects.toMatchObject({ statusCode: 404 })
        expect(PaymentMethod.findOne.mock.calls[0][0].where).toEqual({ id: 99, user_id: 11, is_deleted: false })
    })
})
