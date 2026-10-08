import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, createSSRApp, ssrContextKey, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import OrderDetailView from './OrderDetailView.vue'
const mocks = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), route: { name: 'checkout-orders', params: { checkoutToken: 'token' }, fullPath: '/checkout/token/orders' } }))
vi.mock('../services/orderService.js', () => ({ getOrder: mocks.get, getCheckoutOrders: mocks.list }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ back: vi.fn(), replace: vi.fn() }), RouterLink: { render: () => null } }))
const renderer = createRenderer({
  createElement: tag => ({ tag, children: [] }), createText: text => ({ text }), createComment: text => ({ text }),
  insert: (node, parent) => { node.parent = parent; parent.children.push(node) }, remove: node => { if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node) },
  setText: (node, text) => { node.text = text }, setElementText: (node, text) => { node.text = text },
  parentNode: node => node.parent, nextSibling: () => null, patchProp: (node, key, previous, value) => { node[key] = value }
})
let app, state, container
async function mount(currentUser = { id: 1 }) {
  app = renderer.createApp({ ...OrderDetailView, render: () => null }, { currentUser, sessionLoading: false })
  app.provide(ssrContextKey, { modules: new Set() })
  container = { children: [] }
  app.mount(container)
  state = app._instance.setupState
  for (let i = 0; i < 12; i++) await Promise.resolve()
  await nextTick()
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.route.name = 'checkout-orders'
  mocks.list.mockResolvedValue({ data: { orders: [{ id: 1, sub_total: '200000.20', shipping_fee: '30000.00', order_total: '230000.20', items: [] }, { id: 2, sub_total: '100000.50', shipping_fee: '20000.00', order_total: '120000.50', items: [] }] } })
})
afterEach(() => app?.unmount())
describe('Order details', () => {
  it('renders only the receipt fields and no confirmation hero or shopping promotion', async () => {
    mocks.list.mockResolvedValueOnce({ data: { orders: [{ id: 9, shop: { name: 'Running shop' }, sub_total: '200.00', shipping_fee: '20.00', order_total: '220.00', status: 'pending', shipping_method_name: 'Express', estimated_delivery_from: '2026-10-03', estimated_delivery_to: '2026-10-05', payment_method_data: { name: 'Cash on delivery', type: 'cod' }, payment_status: 'unpaid', items: [{ id: 8, product_name: 'Running shoe', sku: 'HIDDEN-SKU', quantity: 2, unit_price: '100.00', line_total: '200.00', variant_data: [{ name: 'Size', value: 'US 9' }, { name: 'Color', value: 'White' }] }] }] } })
    await mount()
    const text = await renderToString(createSSRApp({ ...OrderDetailView, setup: () => state }, { currentUser: { id: 1 } }))
    for (const value of ['Order summary', 'Running shoe', 'US 9', 'White', 'Express', 'Cash on delivery', 'Not paid yet']) expect(text).toContain(value)
    for (const value of ['You’re all set', 'Order confirmed', 'Continue shopping', 'HIDDEN-SKU']) expect(text).not.toContain(value)
  })
  it('loads separate shop orders for a checkout and calculates the display total', async () => {
    await mount()
    expect(mocks.list).toHaveBeenCalledWith('token')
    expect(state.orders).toHaveLength(2)
    expect(state.checkoutTotal).toBe(350000.7)
  })
  it('does not load private orders before sign-in', async () => {
    await mount(null)
    expect(mocks.list).not.toHaveBeenCalled()
    expect(state.orders).toEqual([])
  })
  it('loads an individual order and shows API errors safely', async () => {
    mocks.route.name = 'order-detail'
    mocks.route.params.id = '8'
    mocks.get.mockResolvedValueOnce({ data: { id: 8, order_total: '100.00' } })
    await mount()
    expect(mocks.get).toHaveBeenCalledWith('8')
    expect(state.orders[0].id).toBe(8)
    mocks.get.mockRejectedValueOnce(new Error('Order not found'))
    await state.load()
    expect(state.error).toBe('Order not found')
    expect(state.orders).toEqual([])
  })
})
