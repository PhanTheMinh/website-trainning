const { User } = require('../models')

function destroySession(req) {
    return new Promise(function (resolve) {
        if (!req.session) {
            return resolve()
        }

        return req.session.destroy(function () {
            return resolve()
        })
    })
}

async function authenticate(req, res, next) {
    if (!req.session?.user?.id) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized'
        })
    }

    try {
        const user = await User.findByPk(req.session.user.id, {
            attributes: ['id', 'role', 'status']
        })

        if (!user) {
            await destroySession(req)
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            })
        }

        if (user.status !== 'active') {
            await destroySession(req)
            return res.status(403).json({
                success: false,
                message: 'Account is not active'
            })
        }

        req.user = {
            id: user.id,
            role: user.role,
            status: user.status
        }
        return next()
    } catch (error) {
        return next(error)
    }
}

module.exports = authenticate
