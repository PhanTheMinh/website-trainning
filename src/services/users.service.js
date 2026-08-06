const sequelize = require('../config/database')
const { Op } = require('sequelize')
const { User } = require('../models')

const publicUserAttributes = [
    'id',
    'full_name',
    'phone',
    'address',
    'email',
    'role',
    'status',
    'avatar_url'
]

async function getProfile(userId) {
    const user = await User.findByPk(userId, {
        attributes: publicUserAttributes
    })

    if (!user) {
        const error = new Error('User not found')
        error.statusCode = 404
        throw error
    }

    return user
}

async function updateProfile(userId, profile) {
    const user = await User.findByPk(userId)

    if (!user) {
        const error = new Error('User not found')
        error.statusCode = 404
        throw error
    }

    const phone = profile.phone || null

    if (phone) {
        const existedPhone = await User.findOne({
            where: {
                phone,
                id: {
                    [Op.ne]: userId
                }
            }
        })

        if (existedPhone) {
            const error = new Error('Phone already exists')
            error.statusCode = 400
            throw error
        }
    }

    if (Object.hasOwn(profile, 'full_name')) {
        user.full_name = profile.full_name
    }

    if (Object.hasOwn(profile, 'phone')) {
        user.phone = phone
    }

    if (Object.hasOwn(profile, 'address')) {
        user.address = profile.address || null
    }

    await user.save()

    return User.findByPk(userId, {
        attributes: publicUserAttributes
    })
}

async function updateAvatar(userId, avatarUrl) {
    return sequelize.transaction(async function (transaction) {
        const user = await User.findByPk(userId, {
            transaction,
            lock: transaction.LOCK.UPDATE
        })

        if (!user) {
            const error = new Error('User not found')
            error.statusCode = 404
            throw error
        }

        const oldAvatarUrl = user.avatar_url || null

        user.avatar_url = avatarUrl
        await user.save({ transaction })

        const updatedUser = await User.findByPk(userId, {
            attributes: publicUserAttributes,
            transaction
        })

        return {
            user: updatedUser,
            oldAvatarUrl
        }
    })
}

module.exports = {
    getProfile,
    updateProfile,
    updateAvatar
}
