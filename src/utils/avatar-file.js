const fs = require('fs/promises')
const path = require('path')

const {
    avatarsDirectory,
    avatarsUrlPrefix
} = require('../config/uploads')

async function removeFile(filePath) {
    if (!filePath) {
        return
    }

    try {
        await fs.unlink(filePath)
    } catch (error) {
        if (error.code !== 'ENOENT') {
            throw error
        }
    }
}

async function removeAvatarByUrl(avatarUrl) {
    if (!avatarUrl?.startsWith(`${avatarsUrlPrefix}/`)) {
        return
    }

    const filename = path.basename(avatarUrl)

    const validGeneratedName =
        /^user-\d+-\d+-[a-f0-9]{12}\.(jpg|png|webp)$/

    if (!validGeneratedName.test(filename)) {
        return
    }

    const filePath = path.join(
        avatarsDirectory,
        filename
    )

    await removeFile(filePath)
}

async function isValidImageFile(filePath, mimetype) {
    const handle = await fs.open(filePath, 'r')

    try {
        const buffer = Buffer.alloc(12)
        const { bytesRead } = await handle.read(
            buffer,
            0,
            buffer.length,
            0
        )

        if (bytesRead < 12) {
            return false
        }

        if (mimetype === 'image/jpeg') {
            return buffer[0] === 0xff &&
                buffer[1] === 0xd8 &&
                buffer[2] === 0xff
        }

        if (mimetype === 'image/png') {
            return buffer.subarray(0, 8).equals(
                Buffer.from([
                    0x89, 0x50, 0x4e, 0x47,
                    0x0d, 0x0a, 0x1a, 0x0a
                ])
            )
        }

        if (mimetype === 'image/webp') {
            return buffer.subarray(0, 4).toString() === 'RIFF' &&
                buffer.subarray(8, 12).toString() === 'WEBP'
        }

        return false
    } finally {
        await handle.close()
    }
}

module.exports = {
    removeFile,
    removeAvatarByUrl,
    isValidImageFile
}
