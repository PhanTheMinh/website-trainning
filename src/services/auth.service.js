const { User } = require('../models')
const { hashPassword } = require('../utils/hash')
const { generateToken } = require('../utils/jwt')

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
        password: hashPassword(data.password),
        role: 'user',
        status: 'active'
    })

    return {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
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

    if (user.password !== hashPassword(data.password)) {
        const error = new Error('Invalid email or password')
        error.statusCode = 400
        throw error
    }

    // console.log('DB password  :', user.password)
    // console.log('Input hash   :', hashPassword(data.password))
    // console.log('Equal        :', user.password === hashPassword(data.password))

    if (user.status !== 'active') {
        const error = new Error('Account is not active')
        error.statusCode = 403
        throw error
    }

    // const token = generateToken({
    //     id: user.id,
    //     email: user.email,
    //     role: user.role
    // })

    return {
        user: {
            id: user.id,
            full_name: user.full_name,
            email: user.email,
            phone: user.phone,
            role: user.role,
            status: user.status
        }
        // ,
        // token
    }
}

module.exports = {
    register,
    login
}