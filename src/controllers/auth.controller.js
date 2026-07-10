const authService = require('../services/auth.service')
const { registerSchema, loginSchema  } = require('../validators/auth.validator')


async function register(req, res) {
    try {
        const { error, value } = registerSchema.validate(req.body)

        if (error) {
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            })
        }

        const user = await authService.register(value)

        return res.status(201).json({
            success: true,
            message: 'Register successfully',
            data: user
        })
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Internal server error'
        })
    }
}

async function login(req, res) {
    try {
        const { error, value } = loginSchema.validate(req.body)

        if (error) {
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            })
        }

        const result = await authService.login(value)
            req.session.user = result.user

        return res.status(200).json({
            success: true,
            message: 'Login successfully',
            status: res.statusCode,
            data: result.user
        })
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Internal server error'
        })
    }
}

module.exports = {
    register,
    login
}