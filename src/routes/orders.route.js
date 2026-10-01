const router = require('express').Router()
const authenticate = require('../middlewares/auth.middleware')
const controller = require('../controllers/orders.controller')
router.use(authenticate)
router.post('/', controller.create)
router.get('/:id', controller.get)
module.exports = router
