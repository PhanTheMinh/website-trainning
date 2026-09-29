const request = require('supertest')
const app = require('../src/app')
const sequelize = require('../src/config/database')
const { PaymentMethod, Shop, User } = require('../src/models')
const { hashPassword } = require('../src/utils/hash')

describe('Payment method management', () => {
    const stamp = Date.now()
    let agent
    let user

    beforeAll(async () => {
        user = await User.create({
            full_name: 'Payment manager',
            email: `payment-manager-${stamp}@example.com`,
            password: await hashPassword('123456'),
            role: 'user',
            status: 'active'
        })
        await Shop.create({
            owner_user_id: user.id,
            name: 'Payment shop',
            slug: `payment-shop-${stamp}`,
            status: 'active'
        })
        agent = request.agent(app)
        await agent.post('/api/auth/login').send({
            email: user.email,
            password: '123456'
        })
    })

    afterAll(async () => {
        try {
            await PaymentMethod.destroy({ where: { user_id: user.id }, force: true })
            await User.destroy({ where: { id: user.id } })
        } finally {
            await sequelize.close()
        }
    })

    it('creates, lists, edits, disables and soft-deletes COD', async () => {
        const created = await agent.post('/api/shops/me/payment-methods').send({
            name: 'Thanh toán khi nhận hàng',
            payment_data: {
                type: 'cod',
                description: 'Thanh toán khi giao hàng',
                instructions: 'Chuẩn bị đúng số tiền'
            },
            is_active: true
        })
        expect(created.status).toBe(201)
        expect(created.body.data).toMatchObject({ is_active: true, is_deleted: false })
        const id = created.body.data.id

        expect((await agent.post('/api/shops/me/payment-methods').send({
            name: 'COD duplicate',
            payment_data: { type: 'cod' }
        })).status).toBe(409)

        const list = await agent.get('/api/shops/me/payment-methods')
        expect(list.status).toBe(200)
        expect(list.body.data.map((method) => method.id)).toContain(id)

        const edited = await agent.patch(`/api/shops/me/payment-methods/${id}`).send({
            name: 'COD',
            payment_data: { type: 'cod', description: 'Pay on delivery' }
        })
        expect(edited.status).toBe(200)
        expect(edited.body.data.name).toBe('COD')

        const disabled = await agent.patch(`/api/shops/me/payment-methods/${id}/status`).send({
            is_active: false
        })
        expect(disabled.status).toBe(200)
        expect(disabled.body.data.is_active).toBe(false)

        expect((await agent.delete(`/api/shops/me/payment-methods/${id}`)).status).toBe(204)
        expect((await agent.get(`/api/shops/me/payment-methods/${id}`)).status).toBe(404)
        const deleted = await PaymentMethod.findByPk(id)
        expect(deleted).toMatchObject({ is_active: false, is_deleted: true })
    })

    it('rejects invalid payment data', async () => {
        const response = await agent.post('/api/shops/me/payment-methods').send({
            name: 'Unsupported',
            payment_data: { type: 'momo' }
        })
        expect(response.status).toBe(400)
    })
})
