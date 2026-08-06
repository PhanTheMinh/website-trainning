const { User } = require('../models')
const {
    hashPassword,
    verifyPassword,
    needsPasswordRehash
} = require('../utils/hash')

async function register(data) {
    const existedEmail = await User.findOne({
        where: {
            email: data.email
        }
    })

    if (existedEmail) {
        const error = new Error('Email already exists')
        error.statusCode = 400
        throw error
    }

    if (data.phone) {
        const existedPhone = await User.findOne({
            where: {
                phone: data.phone
            }
        })

        if (existedPhone) {
            const error = new Error('Phone already exists')
            error.statusCode = 400
            throw error
        }
    }

    const user = await User.create({
        full_name: data.full_name,
        email: data.email,
        phone: data.phone || null,
        address: data.address || null,
        password: hashPassword(data.password),
        role: 'user',
        status: 'active',
        avatar_url: null
    })

    return {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        address: user.address,
        role: user.role,
        status: user.status,
        avatar_url: user.avatar_url,
        created_at: user.created_at
    }
}

async function login(data) {
    const user = await User.findOne({
        where: {
            email: data.email
        }
    })

    if (!user) {
        const error = new Error('Invalid email or password')
        error.statusCode = 400
        throw error
    }

    if (!verifyPassword(data.password, user.password)) {
        const error = new Error('Invalid email or password')
        error.statusCode = 400
        throw error
    }

    if (user.status !== 'active') {
        const error = new Error('Account is not active')
        error.statusCode = 403
        throw error
    }

    if (needsPasswordRehash(user.password)) {
        user.password = hashPassword(data.password)
        await user.save()
    }

    return {
        user: {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            phone: user.phone,
            address: user.address,
            role: user.role,
            status: user.status,
            avatar_url: user.avatar_url
        }
    }
}

module.exports = {
    register,
    login
}
