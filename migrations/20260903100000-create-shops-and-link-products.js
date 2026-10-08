'use strict'

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('shops', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      owner_user_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(120),
        allowNull: false
      },
      slug: {
        type: Sequelize.STRING(180),
        allowNull: false
      },
      logo_url: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      cover_url: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      description: {
        type: Sequelize.TEXT,
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
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    })

    await queryInterface.addIndex('shops', ['owner_user_id'], {
      name: 'shops_owner_user_id_unique',
      unique: true
    })
    await queryInterface.addIndex('shops', ['slug'], {
      name: 'shops_slug_unique',
      unique: true
    })
    await queryInterface.addIndex('shops', ['status', 'deleted_at'], {
      name: 'shops_status_deleted_at'
    })

    await queryInterface.sequelize.query(`
      INSERT INTO shops (
        owner_user_id,
        name,
        slug,
        logo_url,
        cover_url,
        description,
        status,
        created_at,
        updated_at,
        deleted_at
      )
      SELECT
        product_owners.owner_id,
        CONCAT(
          'Gian hàng ',
          COALESCE(NULLIF(TRIM(users.full_name), ''), product_owners.owner_id)
        ),
        CONCAT('shop-', product_owners.owner_id),
        users.avatar_url,
        NULL,
        NULL,
        'active',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        NULL
      FROM (
        SELECT DISTINCT owner_id
        FROM products
      ) AS product_owners
      INNER JOIN users ON users.id = product_owners.owner_id
    `)

    await queryInterface.addColumn('products', 'shop_id', {
      type: Sequelize.BIGINT,
      allowNull: true,
      references: {
        model: 'shops',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })

    await queryInterface.sequelize.query(`
      UPDATE products
      INNER JOIN shops ON shops.owner_user_id = products.owner_id
      SET products.shop_id = shops.id
      WHERE products.shop_id IS NULL
    `)

    const [rows] = await queryInterface.sequelize.query(`
      SELECT COUNT(*) AS missing_count
      FROM products
      WHERE shop_id IS NULL
    `)

    if (Number(rows[0].missing_count) > 0) {
      throw new Error('Unable to link every existing product to a shop')
    }

    await queryInterface.changeColumn('products', 'shop_id', {
      type: Sequelize.BIGINT,
      allowNull: false,
      references: {
        model: 'shops',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    })

    await queryInterface.addIndex(
      'products',
      ['shop_id', 'status', 'deleted_at'],
      { name: 'products_shop_status_deleted_at' }
    )
  },

  async down(queryInterface) {
    await queryInterface.removeIndex(
      'products',
      'products_shop_status_deleted_at'
    )
    await queryInterface.removeColumn('products', 'shop_id')
    await queryInterface.dropTable('shops')
  }
}
