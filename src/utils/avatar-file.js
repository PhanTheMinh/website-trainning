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

function hasAvifFileTypeBox(buffer, bytesRead) {
    const supportedBrands = new Set(['avif', 'avis'])
    let searchOffset = 0

    while (searchOffset + 12 <= bytesRead) {
        const typeOffset = buffer.indexOf(
            Buffer.from('ftyp'),
            searchOffset
        )

        if (typeOffset < 4 || typeOffset + 8 > bytesRead) {
            return false
        }

        const boxOffset = typeOffset - 4
        const declaredSize = buffer.readUInt32BE(boxOffset)
        let payloadOffset = typeOffset + 4
        let boxSize = declaredSize

        if (declaredSize === 1) {
            if (typeOffset + 12 > bytesRead) {
                return false
            }

            const extendedSize = buffer.readBigUInt64BE(typeOffset + 4)

            if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) {
                return false
            }

            boxSize = Number(extendedSize)
            payloadOffset = typeOffset + 12
        }

        if (boxSize === 0) {
            boxSize = bytesRead - boxOffset
        }

        const boxEnd = Math.min(bytesRead, boxOffset + boxSize)

        if (boxSize >= payloadOffset - boxOffset + 8) {
            const majorBrand = buffer
                .subarray(payloadOffset, payloadOffset + 4)
                .toString('ascii')

            if (supportedBrands.has(majorBrand)) {
                return true
            }

            for (
                let offset = payloadOffset + 8;
                offset + 4 <= boxEnd;
                offset += 4
            ) {
                const compatibleBrand = buffer
                    .subarray(offset, offset + 4)
                    .toString('ascii')

                if (supportedBrands.has(compatibleBrand)) {
                    return true
                }
            }
        }

        searchOffset = typeOffset + 4
    }

    return false
}

async function detectImageFileType(filePath) {
    const handle = await fs.open(filePath, 'r')

    try {
        const buffer = Buffer.alloc(64 * 1024)
        const { bytesRead } = await handle.read(
            buffer,
            0,
            buffer.length,
            0
        )

        if (bytesRead < 12) {
            return null
        }

        if (
            buffer[0] === 0xff &&
            buffer[1] === 0xd8 &&
            buffer[2] === 0xff
        ) {
            return {
                mimetype: 'image/jpeg',
                extension: '.jpg'
            }
        }

        if (buffer.subarray(0, 8).equals(
            Buffer.from([
                0x89, 0x50, 0x4e, 0x47,
                0x0d, 0x0a, 0x1a, 0x0a
            ])
        )) {
            return {
                mimetype: 'image/png',
                extension: '.png'
            }
        }

        if (
            buffer.subarray(0, 4).toString() === 'RIFF' &&
            buffer.subarray(8, 12).toString() === 'WEBP'
        ) {
            return {
                mimetype: 'image/webp',
                extension: '.webp'
            }
        }

        if (hasAvifFileTypeBox(buffer, bytesRead)) {
            return {
                mimetype: 'image/avif',
                extension: '.avif'
            }
        }

        return null
    } finally {
        await handle.close()
    }
}

async function isValidImageFile(filePath, mimetype) {
    const detectedType = await detectImageFileType(filePath)

    return detectedType?.mimetype === mimetype
}

module.exports = {
    removeFile,
    removeAvatarByUrl,
    detectImageFileType,
    isValidImageFile
}
