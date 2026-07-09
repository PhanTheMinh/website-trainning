const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth.middleware');


const userController = require('../controllers/users.controller')

router.get('/me',authenticate, userController.getProfile)
router.put('/me',authenticate, userController.updateProfile)

module.exports = router