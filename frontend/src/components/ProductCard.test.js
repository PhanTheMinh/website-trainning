import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import ProductCard from './ProductCard.vue'
import { categories } from '../data/categories.js'

async function render(product) {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { render: () => null } }, { path: '/products/:id', name: 'product-detail', component: { render: () => null } }] })
  await router.push('/')
  const app = createSSRApp({ render: () => h(ProductCard, { product }) })
  app.use(router)
  return renderToString(app)
}
const product = { name: 'Race shoe', brand: 'Test brand', price: 1000000, stock: 4, imageUrl: '/shoe.jpg', detailRoute: { name: 'product-detail', params: { id: 1 } } }
describe('Redesigned product cards', () => {
  it('keeps products with options on the selection flow', async () => {
    const html = await render({ ...product, requiresSelection: true })
    expect(html).toContain('Choose options')
    expect(html).toContain('href="/products/1"')
    expect(html).not.toContain('Add to cart')
    expect(html).toContain('VND')
    expect(html).toContain('1,000,000')
  })
  it('disables direct add to cart when out of stock', async () => {
    const html = await render({ ...product, stock: 0 })
    expect(html).toContain('Sold out')
    expect(html).toMatch(/<button[^>]*disabled/)
  })
  it('renders missing images without inventing badges or ratings', async () => {
    const html = await render({ ...product, imageUrl: '' })
    expect(html).toContain('Image unavailable')
    expect(html).not.toContain('Best Seller')
    expect(html).not.toContain('Wishlist')
  })
  it('uses English category labels without changing backend identifiers', () => {
    expect(categories[0].name).toBe('Running shoes')
    expect(categories[0].value).toBe('giay-chay-bo')
    expect(categories[0].slug).toBe('giay-chay-bo')
  })
})
