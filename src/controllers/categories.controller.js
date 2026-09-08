const categoryService = require('../services/categories.service')

async function listCategories(req, res, next) {
    try {
        const categories = await categoryService.listActiveCategories()

        return res.status(200).json({
            success: true,
            message: 'Categories retrieved successfully',
            data: categories
        })
    } catch (error) {
        return next(error)
    }
}

module.exports = {
    listCategories
}
