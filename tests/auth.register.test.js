const request = require('supertest')
const app = require('../src/app')
const sequelize = require('../src/config/database')
const { User } = require('../src/models')

describe('POST /api/auth/register', function () {
    beforeEach(async function () {
        await User.destroy({
            where: {},
            truncate: true
        })
    })

    afterAll(async function () {
        await sequelize.close()
    })

    it('should register successfully', async function () {
        const response = await request(app)
            .post('/api/auth/register')
            .send({
                full_name: 'Nguyen Duc Hai',
                email: 'hai_test@gmail.com',
                phone: '0338529704',
                password: '123456'
            })

        expect(response.status).toBe(201)
        expect(response.body.success).toBe(true)
        expect(response.body.data.email).toBe('hai_test@gmail.com')
        expect(response.body.data.password).toBeUndefined()
    })

    it('should not register with duplicate email', async function () {
        await User.create({
            full_name: 'Nguyen Duc Hai',
            email: 'duplicate@gmail.com',
            phone: '0338529701',
            password: 'hashed_password',
            role: 'user',
            status: 'active'
        })

        const response = await request(app)
            .post('/api/auth/register')
            .send({
                full_name: 'Nguyen Van B',
                email: 'duplicate@gmail.com',
                phone: '0338529702',
                password: '123456'
            })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(response.body.message).toBe('Email already exists')
    })

    it('should not register with duplicate phone', async function () {
        await User.create({
            full_name: 'Nguyen Duc Hai',
            email: 'phone1@gmail.com',
            phone: '0338529703',
            password: 'hashed_password',
            role: 'user',
            status: 'active'
        })

        const response = await request(app)
            .post('/api/auth/register')
            .send({
                full_name: 'Nguyen Van B',
                email: 'phone2@gmail.com',
                phone: '0338529703',
                password: '123456'
            })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(response.body.message).toBe('Phone already exists')
    })

    it('should not register with invalid email', async function () {
        const response = await request(app)
            .post('/api/auth/register')
            .send({
                full_name: 'Nguyen Duc Hai',
                email: 'invalid-email',
                phone: '0338529704',
                password: '123456'
            })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
    })

    it('should not register without password', async function () {
        const response = await request(app)
            .post('/api/auth/register')
            .send({
                full_name: 'Nguyen Duc Hai',
                email: 'nopassword@gmail.com',
                phone: '0338529705'
            })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
    })

    it('should not register with short password', async function () {
        const response = await request(app)
            .post('/api/auth/register')
            .send({
                full_name: 'Nguyen Duc Hai',
                email: 'shortpass@gmail.com',
                phone: '0338529706',
                password: '123'
            })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
    })
})