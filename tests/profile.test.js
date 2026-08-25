const fs = require('fs/promises')
const path = require('path')
const request = require('supertest')

const app = require('../src/app')
const sequelize = require('../src/config/database')
const { User } = require('../src/models')
const { hashPassword } = require('../src/utils/hash')
const { avatarsDirectory } = require('../src/config/uploads')

const testEmail = `profile-test-${Date.now()}@example.com`
const testPhone = `08${Date.now().toString().slice(-8)}`
let testUser
let uploadedAvatarPath

describe('Profile APIs', function () {
    it('uses src/uploads/avatars as the avatar storage directory', function () {
        expect(avatarsDirectory).toBe(
            path.resolve(__dirname, '..', 'src', 'uploads', 'avatars')
        )
    })

    beforeAll(async function () {
        testUser = await User.create({
            full_name: 'Profile Test User',
            email: testEmail,
            phone: null,
            address: null,
            password: await hashPassword('123456'),
            role: 'user',
            status: 'active'
        })
    })

    afterAll(async function () {
        if (uploadedAvatarPath) {
            await fs.rm(uploadedAvatarPath, { force: true })
        }

        await User.destroy({
            where: {
                id: testUser.id
            }
        })
        await sequelize.close()
    })

    async function authenticatedAgent() {
        const agent = request.agent(app)
        const response = await agent
            .post('/api/auth/login')
            .send({
                email: testEmail,
                password: '123456'
            })

        expect(response.status).toBe(200)
        return agent
    }

    it('gets and updates the authenticated profile', async function () {
        const agent = await authenticatedAgent()

        const getResponse = await agent.get('/api/users/me')

        expect(getResponse.status).toBe(200)
        expect(getResponse.body.data.email).toBe(testEmail)
        expect(getResponse.body.data.password).toBeUndefined()

        const updateResponse = await agent
            .put('/api/users/me')
            .send({
                full_name: 'Updated Profile User',
                phone: testPhone,
                address: '45 Le Loi, District 1'
            })

        expect(updateResponse.status).toBe(200)
        expect(updateResponse.body.success).toBe(true)
        expect(updateResponse.body.data.full_name).toBe('Updated Profile User')
        expect(updateResponse.body.data.phone).toBe(testPhone)
        expect(updateResponse.body.data.address).toBe('45 Le Loi, District 1')

        const profileResponse = await agent.get('/api/users/me')

        expect(profileResponse.body.data.full_name).toBe('Updated Profile User')
        expect(profileResponse.body.data.address).toBe('45 Le Loi, District 1')

        await agent.post('/api/auth/logout')
    })

    it('uploads an avatar, stores its URL, and serves the image', async function () {
        const agent = await authenticatedAgent()
        const png = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
            'base64'
        )

        const uploadResponse = await agent
            .put('/api/users/me/avatar')
            .attach('avatar', png, {
                filename: 'avatar.png',
                contentType: 'image/png'
            })

        expect(uploadResponse.status).toBe(200)
        expect(uploadResponse.body.success).toBe(true)
        expect(uploadResponse.body.data.avatar_url).toMatch(
            /^\/uploads\/avatars\/user-\d+-\d+-[a-f0-9]{12}\.png$/
        )

        const avatarUrl = uploadResponse.body.data.avatar_url
        uploadedAvatarPath = path.join(
            avatarsDirectory,
            path.basename(avatarUrl)
        )

        await expect(fs.stat(uploadedAvatarPath)).resolves.toMatchObject({
            size: png.length
        })

        const storedUser = await User.findByPk(testUser.id)
        expect(storedUser.avatar_url).toBe(avatarUrl)

        const imageResponse = await agent.get(avatarUrl)
        expect(imageResponse.status).toBe(200)
        expect(imageResponse.headers['content-type']).toBe('image/png')

        await agent.post('/api/auth/logout')
    })

    it('rejects profile updates with unsupported fields', async function () {
        const agent = await authenticatedAgent()
        const response = await agent
            .put('/api/users/me')
            .send({
                role: 'admin'
            })

        expect(response.status).toBe(400)
        expect(response.body.success).toBe(false)

        await agent.post('/api/auth/logout')
    })

    it('returns a conflict when another account already uses the phone', async function () {
        const email = `profile-conflict-${Date.now()}@example.com`
        const conflictUser = await User.create({
            full_name: 'Profile Conflict User',
            email,
            phone: null,
            address: null,
            password: await hashPassword('123456'),
            role: 'user',
            status: 'active'
        })
        const agent = request.agent(app)

        try {
            expect((await agent.post('/api/auth/login').send({
                email,
                password: '123456'
            })).status).toBe(200)

            const response = await agent.put('/api/users/me').send({
                phone: testPhone
            })

            expect(response.status).toBe(409)
            expect(response.body.message).toBe('Phone already exists')
        } finally {
            await User.destroy({ where: { id: conflictUser.id } })
        }
    })
})
