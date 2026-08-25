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
  })

  it('requires the detail page to select products with options', () => {
    const product = mapApiProduct(createProduct({
      options: [{ code: 'size', values: [{ value: '40' }] }]
    }))

    expect(product.requiresSelection).toBe(true)
    expect(product.cartItem).toBeNull()
  })
})
