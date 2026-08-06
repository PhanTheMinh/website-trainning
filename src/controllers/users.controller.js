const userService = require('../services/users.service')
const { avatarsUrlPrefix } = require('../config/uploads')
const {
    removeFile,
    removeAvatarByUrl,
    isValidImageFile
} = require('../utils/avatar-file')
const { updateProfileSchema } = require('../validators/profile.validator')

async function getProfile(req, res) {
    try {
        const userId = req.user.id
        const user = await userService.getProfile(userId)

        return res.status(200).json({
            success: true,
            message: 'Profile retrieved successfully',
            data: user
        })
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Internal server error'
        })
    }
}

async function updateProfile(req, res) {
    try {
        const { error, value } = updateProfileSchema.validate(req.body)

        if (error) {
            return res.status(400).json({
                success: false,
                message: error.details[0].message
            })
        }

        const user = await userService.updateProfile(req.user.id, value)

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: user
        })
    } catch (error) {
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || 'Internal server error'
        })
    }
}

async function uploadAvatar(req, res, next) {
    let databaseUpdated = false

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Avatar file is required'
            })
        }

        const validImage = await isValidImageFile(
            req.file.path,
            req.file.mimetype
        )

        if (!validImage) {
            await removeFile(req.file.path)

            return res.status(400).json({
                success: false,
                message: 'Invalid image content'
            })
        }

        const avatarUrl =
            `${avatarsUrlPrefix}/${req.file.filename}`

        const result = await userService.updateAvatar(
            req.user.id,
            avatarUrl
        )

        databaseUpdated = true

        try {
            await removeAvatarByUrl(result.oldAvatarUrl)
        } catch (deleteError) {
            console.error(
                'Unable to remove old avatar:',
                deleteError.message
            )
        }

        return res.status(200).json({
            success: true,
            message: 'Avatar updated successfully',
            data: result.user
        })
    } catch (error) {
        if (!databaseUpdated && req.file?.path) {
            try {
                await removeFile(req.file.path)
            } catch (cleanupError) {
                console.error(
                    'Unable to clean new avatar:',
                    cleanupError.message
                )
            }
        }

        return next(error)
    }
}

module.exports = {
    getProfile,
    updateProfile,
    uploadAvatar
}
