const request = require('supertest')
const crypto = require('crypto')
const app = require('../src/app')
const sequelize = require('../src/config/database')
const { User } = require('../src/models')
const { hashPassword } = require('../src/utils/hash')

const testEmail = `session-test-${Date.now()}@example.com`
const legacyEmail = `legacy-session-test-${Date.now()}@example.com`
let testUser
let legacyUser

describe('Session authentication', function () {
    beforeAll(async function () {
        testUser = await User.create({
            full_name: 'Session Test User',
            email: testEmail,
            phone: null,
            password: hashPassword('123456'),
            role: 'user',
            status: 'active'
        })

        legacyUser = await User.create({
            full_name: 'Legacy Password User',
            email: legacyEmail,
            phone: null,
            password: crypto
                .createHash('sha256')
                .update('123456')
                .digest('hex'),
            role: 'user',
            status: 'active'
        })
    })

    afterAll(async function () {
        await User.destroy({
            where: {
                id: [testUser.id, legacyUser.id]
            }
        })
        await sequelize.close()
    })

    it('logs in, stores the session, returns the profile, then logs out', async function () {
        const agent = request.agent(app)
        const Session = sequelize.models.Session
        const sessionsBeforeLogin = await Session.count()

        const loginResponse = await agent
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: '123456'
            })

        expect(loginResponse.status).toBe(200)
        expect(loginResponse.body.success).toBe(true)
        expect(loginResponse.headers['set-cookie']).toEqual(
            expect.arrayContaining([expect.stringMatching(/^connect\.sid=/)])
        )

        const sessionsAfterLogin = await Session.count()
        expect(sessionsAfterLogin).toBeGreaterThan(sessionsBeforeLogin)

        const profileResponse = await agent.get('/api/users/me')

        expect(profileResponse.status).toBe(200)
        expect(profileResponse.body.success).toBe(true)
        expect(profileResponse.body.data.id).toBe(testUser.id)
        expect(profileResponse.body.data.email).toBe(testEmail)
        expect(profileResponse.body.data.password).toBeUndefined()

        const logoutResponse = await agent.post('/api/auth/logout')

        expect(logoutResponse.status).toBe(200)
        expect(logoutResponse.body.success).toBe(true)

        const profileAfterLogout = await agent.get('/api/users/me')

        expect(profileAfterLogout.status).toBe(401)
        expect(profileAfterLogout.body.success).toBe(false)
    })

    it('does not create an authenticated session when the password is incorrect', async function () {
        const response = await request(app)
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: 'wrong-password'
            })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)
        expect(response.headers['set-cookie']).toBeUndefined()
    })

    it('upgrades a legacy SHA-256 password after a successful login', async function () {
        const agent = request.agent(app)
        const response = await agent
            .post('/api/auth/login')
            .send({
                email: legacyEmail,
                password: '123456'
            })

        expect(response.status).toBe(200)

        await legacyUser.reload()
        expect(legacyUser.password).toMatch(/^\$2[aby]\$/)

        await agent.post('/api/auth/logout')
    })
})
