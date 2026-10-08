'use strict'

const { Op } = require('sequelize')
const categoryDefinitions = require('../shared/product-categories.json')

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('categories', {
        id: {
          type: Sequelize.BIGINT,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        name: {
          type: Sequelize.STRING(120),
          allowNull: false
        },
        slug: {
          type: Sequelize.STRING(100),
          allowNull: false
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        accent: {
          type: Sequelize.STRING(20),
          allowNull: true
        },
        status: {
          type: Sequelize.STRING(20),
          allowNull: false,
          defaultValue: 'active'
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      }, { transaction })

      await queryInterface.addIndex('categories', ['name'], {
        unique: true,
        name: 'categories_name_unique',
        transaction
      })
      await queryInterface.addIndex('categories', ['slug'], {
        unique: true,
        name: 'categories_slug_unique',
        transaction
      })
      await queryInterface.addIndex('categories', ['status'], {
        name: 'categories_status',
        transaction
      })

      const now = new Date()

      await queryInterface.bulkInsert(
        'categories',
        categoryDefinitions.map((category) => ({
          name: category.name,
          slug: category.slug,
          description: category.description || null,
          accent: category.accent || null,
          status: 'active',
          created_at: now,
          updated_at: now
        })),
        { transaction }
      )

      await queryInterface.addColumn('products', 'category_id', {
        type: Sequelize.BIGINT,
        allowNull: true,
        references: {
          model: 'categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      }, { transaction })

      await queryInterface.addIndex('products', ['category_id'], {
        name: 'products_category_id',
        transaction
      })
      await queryInterface.addIndex(
        'products',
        ['owner_id', 'category_id'],
        {
          name: 'products_owner_category',
          transaction
        }
      )

      const [categories] = await queryInterface.sequelize.query(
        'SELECT id, slug FROM categories',
        { transaction }
      )
      const categoryIdBySlug = new Map(
        categories.map((category) => [category.slug, category.id])
      )

      for (const definition of categoryDefinitions) {
        await queryInterface.bulkUpdate(
          'products',
          {
            category_id: categoryIdBySlug.get(definition.slug)
          },
          {
            category: {
              [Op.in]: Array.from(new Set([
                definition.value,
                definition.slug,
                ...(definition.aliases || [])
              ]))
            }
          },
          { transaction }
        )
      }
    })
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const foreignKeys = await queryInterface.getForeignKeyReferencesForTable(
        'products',
        { transaction }
      )

      for (const foreignKey of foreignKeys) {
        if (foreignKey.columnName === 'category_id') {
          await queryInterface.removeConstraint(
            'products',
            foreignKey.constraintName,
            { transaction }
          )
        }
      }

      const indexes = await queryInterface.showIndex('products', { transaction })

      for (const indexName of ['products_owner_category', 'products_category_id']) {
        if (indexes.some((index) => index.name === indexName)) {
          await queryInterface.removeIndex('products', indexName, { transaction })
        }
      }

      await queryInterface.removeColumn(
        'products',
        'category_id',
        { transaction }
      )
      await queryInterface.dropTable('categories', { transaction })
    })
  }
}
