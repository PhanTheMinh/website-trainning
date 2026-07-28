const userModel = require("../models/user");
const {where} = require("sequelize");

async function getProfile(userId) {
    const profile_user = await userModel.findByPk(userId,
        {attributes:["id","full_name","phone","email","role","status"]},);
    if (!profile_user) {
        const error = new Error("User not found")
        error.statusCode = 404
        throw error
    }

    return profile_user
}

async function updateProfile(userId, profile) {
    await userModel.update({
        full_name: profile.full_name,
        phone: profile.phone
    },
        {
            where: {id: userId}
        })
    const profile_user_update = await userModel.findByPk(userId,
        {attributes:["id","full_name","phone","email","role","status"]},);
    return profile_user_update
}

module.exports = {
    getProfile,
    updateProfile
}
