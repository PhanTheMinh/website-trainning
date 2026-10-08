const authService = require('../services/auth.service')
const { registerSchema, loginSchema  } = require('../validators/auth.validator')

function regenerateSession(req) {
    return new Promise(function (resolve, reject) {
        req.session.regenerate(function (error) {
            if (error) {
                return reject(error)
            }

            return resolve()
        })
    })
}

function saveSession(req) {
    return new Promise(function (resolve, reject) {
        req.session.save(function (error) {
            if (error) {
                return reject(error)
            }

            return resolve()
        })
    })
}

async function register(req, res, next) {
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
        return next(error)
    }
}

async function login(req, res, next) {
    try {
        const { error, value } = loginSchema.validate(req.body)

        if (error) {
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            })
        }

        const result = await authService.login(value)
        await regenerateSession(req)
        req.session.user = {
            id: result.user.id
        }
        await saveSession(req)

        return res.status(200).json({
            success: true,
            message: 'Login successfully',
            data: result.user
        })
    } catch (error) {
        return next(error)
    }
}

async function logout(req, res) {
    try {
        await new Promise(function (resolve, reject) {
            req.session.destroy(function (error) {
                if (error) {
                    return reject(error)
                }

                return resolve()
            })
        })

        res.clearCookie('connect.sid', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: String(
                process.env.SESSION_COOKIE_SAME_SITE || 'lax'
            ).toLowerCase(),
            path: '/'
        })

        return res.status(200).json({
            success: true,
            message: 'Logout successfully'
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Unable to logout'
        })
    }
}

module.exports = {
    register,
    login,
    logout
}
