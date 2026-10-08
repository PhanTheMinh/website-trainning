import { describe, expect, it } from 'vitest'
import { buildProductGallery } from './productGallery.js'

const product = {
  images: [
    { id: 1, image_url: '/product/front.jpg' },
    { id: 2, image_url: '/product/back.jpg' }
  ],
  variants: [
    {
      id: 10,
      status: 'active',
      option_values: [
        { option_code: 'color', value: 'Đen' },
        { option_code: 'size', value: 'M' }
      ],
      images: [
        { id: 20, image_url: '/black/front.jpg' },
        { id: 21, image_url: '/black/side.jpg' }
      ]
    },
    {
      id: 11,
      status: 'active',
      option_values: [
        { option_code: 'color', value: 'Đen' },
        { option_code: 'size', value: 'L' }
      ],
      images: [{ id: 22, image_url: '/black/front.jpg' }]
    },
    {
      id: 12,
      status: 'active',
      option_values: [
        { option_code: 'color', value: 'Trắng' },
        { option_code: 'size', value: 'M' }
      ],
      images: [{ id: 23, image_url: '/white/front.jpg' }]
    }
  ]
}

describe('buildProductGallery', () => {
  it('shows the general product gallery before a variant is selected', () => {
    expect(buildProductGallery(product).map((image) => image.image_url)).toEqual([
      '/product/front.jpg',
      '/product/back.jpg'
    ])
  })

  it('switches immediately to the selected color and removes duplicates', () => {
    expect(buildProductGallery(product, { color: 'Đen' }).map(
      (image) => image.image_url
    )).toEqual(['/black/front.jpg', '/black/side.jpg'])
  })

  it('falls back to product images when a variant has no gallery', () => {
    const noGalleryProduct = {
      ...product,
      variants: product.variants.map((variant) => ({ ...variant, images: [] }))
    }
    expect(buildProductGallery(noGalleryProduct, { color: 'Đen' })).toHaveLength(2)
  })
})

