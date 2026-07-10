const userService = require('../services/users.service')

async function getProfile(req, res) {
    try{

        const userId = req.user.id;
        console.log("User ID: " , userId);
        const data_user = await userService.getProfile(userId);

        return res.status(200).send({
            status: 'success',
            data: data_user,

        })
    }catch(error){
        return res.status(error.statusCode || 500).json({
            status: false,
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

module.exports = {
    getProfile,
    updateProfile
}