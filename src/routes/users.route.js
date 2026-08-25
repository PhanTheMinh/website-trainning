const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth.middleware');
const uploadAvatarMiddleware = require('../middlewares/upload.middleware')

const userController = require('../controllers/users.controller')

router.get('/me',authenticate, userController.getProfile)
router.put('/me',authenticate, userController.updateProfile)
router.put('/me/avatar', authenticate, uploadAvatarMiddleware.single('avatar'), userController.uploadAvatar)

module.exports = router