const userService = require('../services/users.service')

async function getProfile(req, res) {
    try{

        const userId = req.user.id
        const data_user = await userService.getProfile(userId)

        return res.status(200).json({
            success: true,
            message: 'Profile retrieved successfully',
            data: data_user
        })
    }catch(error){
        return res.status(error.statusCode || 500).json({
            success: false,
            message: error.message || "Internal Server Error",
        })
    }
}

async function updateProfile(req, res) {
    try{
        const userId = req.user.id;
        const {full_name, phone } = req.body;
        if(!userId) {
            return res.status(401).send({
                status: 'error',
                message: "User not found",
            })
        }
        const data_user_update = await userService.updateProfile(userId, req.body)
        console.log(data_user_update)
        return res.status(200).send({
            status: res.statusCode,
            message: 'Profile updated successfully',
            data: data_user_update
        })
    }catch(error){
        return res.status(error.statusCode || 500).json({
            status: false,
            message:error.message || "Internal Server Error",
        })
    }
}

async function uploadAvatar(req, res) {
    try {
        console.log("test avt", req.files)
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Avatar file is required'
            })
        }
        console.log("File ảnh: ",req.file)

        const avatarUrl =
            `/uploads/avatars/${req.file.filename}`

        return res.status(200).json({
            success: true,
            message: 'Avatar uploaded successfully',
            data: {
                filename: req.file.filename,
                avatar_url: avatarUrl,
                mimetype: req.file.mimetype,
                size: req.file.size
            }
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Unable to upload avatar'
        })
    }
}

module.exports = {
    getProfile,
    updateProfile,
    uploadAvatar
}
