const { Category } = require('../models')

async function listActiveCategories() {
    const categories = await Category.findAll({
        where: {
            status: 'active'
        },
        attributes: [
            'id',
            'name',
            'slug',
            'description',
            'accent'
        ],
        order: [
            ['name', 'ASC'],
            ['id', 'ASC']
        ]
    })

    return categories.map((category) => category.get({ plain: true }))
}

module.exports = {
    listActiveCategories
}
