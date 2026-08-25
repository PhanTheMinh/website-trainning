'use strict'

function parseLegacyValues(value) {
  if (!value) {
    return []
  }

  let parsed = value

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed)
    } catch {
      return []
    }
  }

  if (!Array.isArray(parsed)) {
    return []
  }

  return Array.from(new Set(
    parsed
      .map((item) => String(item).trim())
      .filter(Boolean)
  ))
}

async function createLegacyOption(
  queryInterface,
  productId,
  code,
  name,
  value,
  sortOrder
) {
  const now = new Date()

  await queryInterface.bulkInsert('product_options', [{
    product_id: productId,
    code,
    name,
    sort_order: sortOrder,
    created_at: now,
    updated_at: now
  }])

  const [options] = await queryInterface.sequelize.query(
    `SELECT id
       FROM product_options
      WHERE product_id = :productId AND code = :code
      LIMIT 1`,
    {
      replacements: { productId, code }
    }
  )

  await queryInterface.bulkInsert('product_option_values', [{
    product_option_id: options[0].id,
    value,
    sort_order: 0,
    created_at: now,
    updated_at: now
  }])

  const [values] = await queryInterface.sequelize.query(
    `SELECT id
       FROM product_option_values
      WHERE product_option_id = :optionId
      LIMIT 1`,
    {
      replacements: { optionId: options[0].id }
    }
  )

  return values[0].id
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'brand', {
      type: Sequelize.STRING(100),
      allowNull: true,
      after: 'category'
    })

    await queryInterface.changeColumn('products', 'status', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'draft'
    })

    await queryInterface.createTable('product_options', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      product_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      code: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(80),
        allowNull: false
      },
      sort_order: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
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
    })

    await queryInterface.addIndex('product_options', ['product_id', 'code'], {
      unique: true,
      name: 'product_options_product_code_unique'
    })

    await queryInterface.createTable('product_option_values', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      product_option_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'product_options',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      value: {
        type: Sequelize.STRING(80),
        allowNull: false
      },
      sort_order: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
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
    })

    await queryInterface.addIndex(
      'product_option_values',
      ['product_option_id', 'value'],
      {
        unique: true,
        name: 'product_option_values_option_value_unique'
      }
    )

    await queryInterface.createTable('product_variants', {
      id: {
        type: Sequelize.BIGINT,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      product_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      sku: {
        type: Sequelize.STRING(64),
        allowNull: false
      },
      variant_key: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      price: {
        type: Sequelize.DECIMAL(12, 2),
        allowNull: true
      },
      image_url: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      stock_quantity: {
        type: Sequelize.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'active'
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
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
    })

    await queryInterface.addIndex('product_variants', ['sku'], {
      unique: true,
      name: 'product_variants_sku_unique'
    })
    await queryInterface.addIndex(
      'product_variants',
      ['product_id', 'variant_key'],
      {
        unique: true,
        name: 'product_variants_product_key_unique'
      }
    )
    await queryInterface.addIndex(
      'product_variants',
      ['product_id', 'status'],
      {
        name: 'product_variants_product_status'
      }
    )

    await queryInterface.createTable('product_variant_values', {
      product_variant_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'product_variants',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      product_option_value_id: {
        type: Sequelize.BIGINT,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'product_option_values',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      }
    })

    await queryInterface.addIndex(
      'product_variant_values',
      ['product_option_value_id'],
      {
        name: 'product_variant_values_option_value'
      }
    )

    const [products] = await queryInterface.sequelize.query(
      'SELECT id, stock, sizes, colors, status FROM products'
    )

    for (const product of products) {
      const sizes = parseLegacyValues(product.sizes)
      const colors = parseLegacyValues(product.colors)
      const combinationCount = Math.max(1, sizes.length) *
        Math.max(1, colors.length)

      if (combinationCount > 1) {
        await queryInterface.sequelize.query(
          `UPDATE products
              SET status = 'needs_variant_setup'
            WHERE id = :productId`,
          {
            replacements: { productId: product.id }
          }
        )
        continue
      }

      const optionValueIds = []

      if (colors.length === 1) {
        optionValueIds.push(await createLegacyOption(
          queryInterface,
          product.id,
          'color',
          'Màu sắc',
          colors[0],
          0
        ))
      }

      if (sizes.length === 1) {
        optionValueIds.push(await createLegacyOption(
          queryInterface,
          product.id,
          'size',
          'Kích thước',
          sizes[0],
          optionValueIds.length
        ))
      }

      const now = new Date()
      const sku = `LEGACY-P${product.id}`
      const variantKey = optionValueIds.length
        ? optionValueIds.map(Number).sort((left, right) => left - right).join('-')
        : 'default'

      await queryInterface.bulkInsert('product_variants', [{
        product_id: product.id,
        sku,
        variant_key: variantKey,
        price: null,
        image_url: null,
        stock_quantity: Number(product.stock) || 0,
        status: 'active',
        is_default: optionValueIds.length === 0,
        created_at: now,
        updated_at: now
      }])

      const [variants] = await queryInterface.sequelize.query(
        'SELECT id FROM product_variants WHERE sku = :sku LIMIT 1',
        {
          replacements: { sku }
        }
      )

      if (optionValueIds.length) {
        await queryInterface.bulkInsert(
          'product_variant_values',
          optionValueIds.map((optionValueId) => ({
            product_variant_id: variants[0].id,
            product_option_value_id: optionValueId
          }))
        )
      }

      await queryInterface.sequelize.query(
        `UPDATE products
            SET status = :status
          WHERE id = :productId`,
        {
          replacements: {
            productId: product.id,
            status: product.status === 'active' ? 'published' : 'draft'
          }
        }
      )
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      `UPDATE products
          SET status = CASE
            WHEN status = 'published' THEN 'active'
            ELSE 'inactive'
          END`
    )
    await queryInterface.dropTable('product_variant_values')
    await queryInterface.dropTable('product_variants')
    await queryInterface.dropTable('product_option_values')
    await queryInterface.dropTable('product_options')
    await queryInterface.changeColumn('products', 'status', {
      type: Sequelize.STRING(20),
      allowNull: false,
      defaultValue: 'active'
    })
    await queryInterface.removeColumn('products', 'brand')
  }
}
