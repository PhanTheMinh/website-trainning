import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, reactive, ssrContextKey, nextTick } from 'vue'
import ProductsView from './ProductsView.vue'
const mocks = vi.hoisted(() => ({ get: vi.fn(), replace: vi.fn(), route: null }))
vi.mock('../services/productService.js', () => ({ getProducts: mocks.get }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ replace: mocks.replace }), RouterLink: { render: () => null } }))
const renderer = createRenderer({
  createElement: tag => ({ tag, children: [] }), createText: text => ({ text }), createComment: text => ({ text }),
  insert: (node, parent) => { node.parent = parent; parent.children.push(node) },
  remove: node => { if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node) },
  setText: (node, text) => { node.text = text }, setElementText: (node, text) => { node.text = text },
  parentNode: node => node.parent, nextSibling: () => null, patchProp: (node, key, previous, value) => { node[key] = value }
})
let app
async function mount() {
  app = renderer.createApp({ ...ProductsView, render: () => null })
  app.provide(ssrContextKey, { modules: new Set() })
  app.mount({ children: [] })
  for (let i = 0; i < 10; i++) await Promise.resolve()
  return app._instance.setupState
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.route = reactive({ name: 'products', params: {}, query: {} })
  mocks.get.mockResolvedValue({ data: [], pagination: { currentPage: 1, totalPages: 0, totalItems: 0 } })
})
afterEach(() => app?.unmount())
describe('Catalog price filter', () => {
  it('applies both draft prices together without requests while typing', async () => {
    mocks.route.query = { q: 'running', sort: 'price-asc', page: '3' }
    const state = await mount()
    state.draftMinPrice = 0
    state.draftMaxPrice = 2000000
    await nextTick()
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.replace).not.toHaveBeenCalled()
    state.applyPriceFilter()
    expect(mocks.replace).toHaveBeenCalledWith({ name: 'products', params: {}, query: { q: 'running', sort: 'price-asc', minPrice: '0', maxPrice: '2000000', page: undefined } })
  })
  it('does not apply an inverted price range', async () => {
    const state = await mount()
    state.draftMinPrice = 2000000
    state.draftMaxPrice = 1000000
    expect(state.filterError).toBe(true)
    state.applyPriceFilter()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
  it('syncs drafts when URL filters change or are cleared', async () => {
    mocks.route.query = { minPrice: '1000000', maxPrice: '2000000' }
    const state = await mount()
    expect(state.draftMinPrice).toBe('1000000')
    expect(state.draftMaxPrice).toBe('2000000')
    mocks.route.query = {}
    await nextTick()
    expect(state.draftMinPrice).toBe('')
    expect(state.draftMaxPrice).toBe('')
  })
})
