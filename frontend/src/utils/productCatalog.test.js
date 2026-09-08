import { describe, expect, it } from 'vitest'
import { mapApiProduct } from './productCatalog.js'

function createProduct(overrides = {}) {
  return {
    id: 42,
    title: 'Giày chạy thử nghiệm',
    brand: 'RunStore',
    category: 'giay-chay-bo',
    price: 1200000,
    min_price: 1200000,
    max_price: 1350000,
    stock: 4,
    shop: {
      id: 9,
      name: 'RunStore Hà Nội',
      slug: 'runstore-ha-noi',
      identifier: '9-runstore-ha-noi'
    },
    images: [{ image_url: '/uploads/products/example.png' }],
    options: [],
    variants: [{
      id: 7,
      sku: 'RUN-42',
      status: 'active',
      is_default: true,
      stock_quantity: 4,
      effective_price: 1200000,
      image_url: null,
      option_values: []
    }],
    ...overrides
  }
}

describe('mapApiProduct', () => {
  it('creates a directly purchasable cart item for a default variant', () => {
    const product = mapApiProduct(createProduct())

    expect(product.requiresSelection).toBe(false)
    expect(product.cartItem).toMatchObject({
      product_id: 42,
      variant_id: 7,
      stock_quantity: 4
    })
    expect(product.imageUrl).toBe(
      'http://localhost:3000/uploads/products/example.png'
    )
    expect(product.imageFrames).toEqual([
      'http://localhost:3000/uploads/products/example.png'
    ])
    expect(product.shopRoute).toEqual({
      name: 'shop',
      params: { identifier: '9-runstore-ha-noi' }
    })
    expect(product.cartItem.shop_id).toBe(9)
  })

  it('requires the detail page to select products with options', () => {
    const product = mapApiProduct(createProduct({
      options: [{ code: 'size', values: [{ value: '40' }] }]
    }))

    expect(product.requiresSelection).toBe(true)
    expect(product.cartItem).toBeNull()
  })

  it('preserves shop navigation when opening a product from a shop page', () => {
    const product = mapApiProduct(createProduct(), {
      fromShop: '9-runstore-ha-noi'
    })

    expect(product.detailRoute.query).toEqual({
      fromShop: '9-runstore-ha-noi'
    })
  })
})
