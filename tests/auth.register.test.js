const request = require('supertest')
const app = require('../src/app')
const sequelize = require('../src/config/database')
const { User } = require('../src/models')

const testEmails = [
    'hai_test@gmail.com',
    'duplicate@gmail.com',
    'phone1@gmail.com',
    'phone2@gmail.com',
    'nopassword@gmail.com',
    'shortpass@gmail.com'
]
const testPhoneSuffix = Date.now().toString().slice(-8)
const testPhones = {
    register: `09${testPhoneSuffix}01`,
    duplicateEmail: `09${testPhoneSuffix}02`,
    duplicatePhone: `09${testPhoneSuffix}03`,
    invalidEmail: `09${testPhoneSuffix}04`,
    noPassword: `09${testPhoneSuffix}05`
}

describe('POST /api/auth/register', function () {
    beforeEach(async function () {
        await User.destroy({
            where: {
                email: testEmails
            }
        })
    })

    afterAll(async function () {
        await User.destroy({
            where: {
                email: testEmails
            }
        })
        await sequelize.close()
    })

    it('should register successfully', async function () {
        const response = await request(app)
            .post('/api/auth/register')
            .send({
                full_name: 'Nguyen Duc Hai',
                email: 'hai_test@gmail.com',
                phone: testPhones.register,
                address: '123 Nguyen Trai',
                password: '123456'
            })

        expect(response.status).toBe(201)
        expect(response.body.success).toBe(true)
        expect(response.body.data.email).toBe('hai_test@gmail.com')
        expect(response.body.data.address).toBe('123 Nguyen Trai')
        expect(response.body.data.avatar_url).toBeNull()
        expect(response.body.data.password).toBeUndefined()
    })

    it('should not register with duplicate email', async function () {
        await User.create({
            full_name: 'Nguyen Duc Hai',
            email: 'duplicate@gmail.com',
            phone: testPhones.duplicateEmail,
            password: 'hashed_password',
            role: 'user',
            status: 'active'
        })

        const response = await request(app)
            .post('/api/auth/register')
            .send({
            full_name: 'Nguyen Van B',
            email: 'duplicate@gmail.com',
            phone: testPhones.register,
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
            phone: testPhones.duplicatePhone,
            password: 'hashed_password',
            role: 'user',
            status: 'active'
        })

        const response = await request(app)
            .post('/api/auth/register')
            .send({
            full_name: 'Nguyen Van B',
            email: 'phone2@gmail.com',
            phone: testPhones.duplicatePhone,
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
            phone: testPhones.invalidEmail,
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
            phone: testPhones.noPassword
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
