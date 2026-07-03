const request = require('supertest')
const app = require('../src/app')

describe('GET /health', function () {
    it('should return API health status', async function () {
        const response = await request(app).get('/health')

        expect(response.status).toBe(200)
        expect(response.body.success).toBe(true)
        expect(response.body.message).toBe('Website ban do chay bo API is running')
    })
})