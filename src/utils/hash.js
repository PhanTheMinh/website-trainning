const crypto = require('crypto')
const bcrypt = require('bcrypt')

function legacyHashPassword(password) {
    return crypto
        .createHash('sha256')
        .update(password)
        .digest('hex')
}

function hashPassword(password) {
    return bcrypt.hash(password, 10)
}

async function verifyPassword(password, storedHash) {
    if (!storedHash || typeof storedHash !== 'string') {
        return false
    }

    if (/^\$2[aby]\$/.test(storedHash)) {
        return bcrypt.compare(password, storedHash)
    }

    const inputHash = legacyHashPassword(password)
    const storedBuffer = Buffer.from(storedHash)
    const inputBuffer = Buffer.from(inputHash)

    return storedBuffer.length === inputBuffer.length &&
        crypto.timingSafeEqual(storedBuffer, inputBuffer)
}

function needsPasswordRehash(storedHash) {
    return !/^\$2[aby]\$/.test(storedHash || '')
}

module.exports = {
    hashPassword,
    verifyPassword,
    needsPasswordRehash
}
