import { describe, expect, it } from 'vitest'
import { formatCurrency, sortProducts } from './catalog.js'

describe('catalog helpers', () => {
  const products = [
    { name: 'Áo chạy bộ', price: 400000, tag: 'Mới' },
    { name: 'Giày tempo', price: 1800000, tag: 'Bán chạy' },
    { name: 'Bình nước', price: 250000, tag: '' }
  ]

  it('sorts a copy without mutating the source list', () => {
    const sorted = sortProducts(products, 'price-asc')

    expect(sorted.map((product) => product.price)).toEqual([
      250000,
      400000,
      1800000
    ])
    expect(products[0].name).toBe('Áo chạy bộ')
  })

  it('prioritizes featured products and formats VND prices', () => {
    expect(sortProducts(products, 'featured')[0].name).toBe('Giày tempo')
    expect(formatCurrency(1250000)).toContain('1.250.000')
  })
})
