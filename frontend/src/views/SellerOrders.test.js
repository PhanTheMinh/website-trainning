import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, createSSRApp, nextTick, ssrContextKey } from 'vue'
import { renderToString } from 'vue/server-renderer'
import SellerOrderListView from './SellerOrderListView.vue'
import SellerOrderDetailView from './SellerOrderDetailView.vue'

const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), update: vi.fn(), push: vi.fn(),
  route: { params: { id: '12' }, query: {}, fullPath: '/me/manage/orders/12', name: 'seller-order-detail' } }))
vi.mock('../services/sellerOrderService.js', () => ({ getSellerOrders: mocks.list, getSellerOrder: mocks.get, updateSellerOrder: mocks.update }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ push: mocks.push }), RouterLink: { template: '<a><slot /></a>' } }))
const renderer = createRenderer({
  createElement: tag => ({ tag, children: [] }), createText: text => ({ text }), createComment: text => ({ text }),
  insert: (node, parent) => { node.parent = parent; parent.children.push(node) },
  remove: node => { if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node) },
  setText: (node, text) => { node.text = text }, setElementText: (node, text) => { node.text = text },
  parentNode: node => node.parent, nextSibling: () => null, patchProp: (node, key, previous, value) => { node[key] = value }
})
const fixture = () => ({ id: 12, order_code: 'ORD-test', order_name: 'Order ORD-test', created_at: '2026-10-01T10:00:00Z', lock_version: 3,
  order_status: 'confirmed', financial_status: 'unpaid', fulfillment_status: 'processing',
  allowed_actions: ['shipped', 'cancel'], items: [{ id: 4, product_name: 'Running shoe', sku: 'SKU-42',
    quantity: 2, unit_price: '100.00', line_total: '200.00', variant_data: [{ name: 'Size', value: '42' }] }],
  events: [], address: { recipient_first_name: 'Minh', recipient_last_name: 'Anh', email: 'buyer@example.com', phone: '0901234567', city: 'Hanoi' },
  shipping_method_name: 'Standard', estimated_delivery_from: '2026-10-04', estimated_delivery_to: '2026-10-06',
  payment_method_data: { type: 'cod', name: 'Cash on delivery' }, sub_total: '200.00', shipping_fee: '20.00', order_total: '220.00' })
let app, state
async function settle() { for (let i = 0; i < 16; i++) await Promise.resolve(); await nextTick() }
async function mount(component, user = { id: 1 }) {
  app = renderer.createApp({ ...component, render: () => null }, { currentUser: user, sessionLoading: false })
  app.provide(ssrContextKey, { modules: new Set() })
  app.mount({ children: [] })
  state = app._instance.setupState
  await settle()
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.route.query = {}
  mocks.get.mockResolvedValue({ data: fixture() })
  mocks.list.mockResolvedValue({ data: [], pagination: { page: 1, totalItems: 0, totalPages: 1 } })
})
afterEach(() => app?.unmount())

describe('Seller order list', () => {
  it('renders the approved list with real response totals and a detail link for every order', async () => {
    mocks.list.mockResolvedValueOnce({ data: [{ ...fixture(), recipient_name: 'Minh Anh' }], pagination: { page: 1, totalItems: 1, totalPages: 1 } })
    await mount(SellerOrderListView)
    const html = await renderToString(createSSRApp({ ...SellerOrderListView, setup: () => state }, { currentUser: { id: 1 } }))
    expect(html).toContain('#0012')
    expect(html).toContain('Minh Anh')
    expect(html).toContain('220')
    expect(html).toContain('Unpaid')
    expect(html).toContain('View order #0012')
    const headings = [...html.matchAll(/<th\b[^>]*>([^<]*)<\/th>/g)].map(match => match[1])
    expect(headings).toEqual(['Order', 'Customer', 'Financial status', 'Total'])
    expect(html).not.toContain('<th>Fulfillment</th>')
    expect(html).not.toContain('<th>Qty</th>')
    expect(html).not.toContain('Seller workspace / Orders')
  })
  it('does not request private data before sign-in', async () => {
    await mount(SellerOrderListView, null)
    expect(mocks.list).not.toHaveBeenCalled()
  })
  it('restores filters and pagination from the route and rejects unknown status values locally', async () => {
    mocks.route.query = { q: 'Minh', page: '2', order_status: 'confirmed', fulfillment_status: 'unknown', sort: 'oldest' }
    await mount(SellerOrderListView)
    expect(mocks.list).toHaveBeenCalledWith({ q: 'Minh', page: 2, limit: 10, order_status: 'confirmed',
      financial_status: 'all', fulfillment_status: 'all', sort: 'oldest' })
    state.filters.q = ' ORD-test '
    await state.apply()
    expect(mocks.push).toHaveBeenCalledWith({ name: 'seller-order-list', query: expect.objectContaining({ q: 'ORD-test', page: '1' }) })
  })
  it('discards older responses when a newer list request finishes first', async () => {
    let finish
    mocks.list.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await mount(SellerOrderListView)
    mocks.list.mockResolvedValueOnce({ data: [{ id: 20 }], pagination: { page: 1, totalItems: 1, totalPages: 1 } })
    await state.load()
    finish({ data: [{ id: 10 }], pagination: { page: 1, totalItems: 1, totalPages: 1 } })
    await settle()
    expect(state.items).toEqual([{ id: 20 }])
  })
  it('clearing search restores the list on page one while keeping financial filters and sorting', async () => {
    mocks.route.query = { q: 'Minh', page: '3', financial_status: 'paid', sort: 'total_desc' }
    await mount(SellerOrderListView)
    state.filters.q = ''
    await state.searchChanged()
    expect(mocks.push).toHaveBeenCalledWith({ name: 'seller-order-list', query: expect.objectContaining({
      q: '', page: '1', financial_status: 'paid', sort: 'total_desc'
    }) })
  })
  it('applies combined filters and total sorting only when confirmed, resetting pagination', async () => {
    mocks.route.query = { q: 'Minh', page: '3', sort: 'total_desc' }
    await mount(SellerOrderListView)
    expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ sort: 'total_desc', page: 3 }))
    state.toggleFilterMenu()
    state.draftFilters.financial_status = 'paid'
    state.draftFilters.fulfillment_status = 'delivered'
    state.draftFilters.sort = 'total_asc'
    expect(state.filters.financial_status).toBe('all')
    await state.applyFilterMenu()
    expect(mocks.push).toHaveBeenCalledWith({ name: 'seller-order-list', query: expect.objectContaining({
      q: 'Minh', page: '1', financial_status: 'paid', fulfillment_status: 'delivered', sort: 'total_asc'
    }) })
    expect(state.filterMenuOpen).toBe(false)
  })
  it('discards unconfirmed menu changes and resets filters without clearing search', async () => {
    mocks.route.query = { q: 'Minh', financial_status: 'paid', sort: 'oldest' }
    await mount(SellerOrderListView)
    state.toggleFilterMenu()
    state.draftFilters.financial_status = 'unpaid'
    state.closeFilterMenu()
    state.toggleFilterMenu()
    expect(state.draftFilters.financial_status).toBe('paid')
    await state.resetFilters()
    expect(mocks.push).toHaveBeenCalledWith({ name: 'seller-order-list', query: expect.objectContaining({
      q: 'Minh', page: '1', financial_status: 'all', fulfillment_status: 'all', sort: 'newest'
    }) })
  })
})
describe('Seller order detail', () => {
  it('renders order snapshots and only actions returned by the backend', async () => {
    await mount(SellerOrderDetailView)
    const html = await renderToString(createSSRApp({ ...SellerOrderDetailView, setup: () => state }, { currentUser: { id: 1 } }))
    for (const text of ['Running shoe', '#0012', 'Mark as shipped', 'Quantity', 'Customer Name', 'buyer@example.com', '0901234567']) expect(html).toContain(text)
    expect(html).not.toContain('Cancel order')
    expect(html).not.toContain('Confirm order')
    expect(html).not.toContain('Record COD payment')
    expect(html).toContain('Order Summary')
    expect(html).toContain('Shipping Address')
    expect(html).not.toContain('<table')
    expect(html).not.toContain('Seller workspace / Orders')
    expect(html).not.toContain('Manage order')
    const headings = ['Line Items', 'id="order-customer"', 'id="order-shipping"', 'id="order-summary"'].map(text => html.indexOf(text))
    expect(headings.every(position => position >= 0)).toBe(true)
    expect(headings).toEqual([...headings].sort((a, b) => a - b))
    const header = html.match(/<header class="rs-simple-header"[^>]*>([\s\S]*?)<\/header>/)[1]
    expect(header).toContain('#0012')
    expect(header).not.toContain('ORD-test')
    expect(header).toContain('Created At')
    expect(header).not.toContain('<button')
    expect(header).not.toContain('Financial status')
  })
  it('keeps history and status data from the API without adding extra sections', async () => {
    const data = { ...fixture(), confirmed_at: '2026-10-01T11:00:00Z', cancellation_reason: 'Customer changed plans',
      events: [{ id: 1, action: 'confirm', created_at: '2026-10-01T11:00:00Z' },
        { id: 2, action: 'cancel', created_at: '2026-10-01T12:00:00Z', reason: 'Customer changed plans' }] }
    mocks.get.mockResolvedValueOnce({ data })
    await mount(SellerOrderDetailView)
    expect(state.order.events).toEqual(data.events)
    expect(state.order.confirmed_at).toBe(data.confirmed_at)
    const html = await renderToString(createSSRApp({ ...SellerOrderDetailView, setup: () => state }, { currentUser: { id: 1 } }))
    expect(html).not.toContain('Order timeline')
    expect(html).not.toContain('Confirmed at')
    expect(html).not.toContain('<h2>Payment</h2>')
    expect(html).not.toContain('SKU-42')
    expect(html).not.toContain('Unit price')
    expect(html).not.toContain('Discount')
    expect(html).not.toContain('Tracking number')
  })
  it.each([[401, 'Sign in to view this order'], [403, 'Order access unavailable'], [404, 'Order not found']])('handles detail access error %s without displaying private data', async (status, title) => {
    mocks.get.mockRejectedValueOnce(Object.assign(new Error(title), { status }))
    await mount(SellerOrderDetailView)
    const html = await renderToString(createSSRApp({ ...SellerOrderDetailView, setup: () => state }, { currentUser: { id: 1 } }))
    expect(state.order).toBeNull()
    expect(html).toContain(title)
    expect(html).not.toContain('Running shoe')
  })
  it('does not call an update twice if the update succeeds but refreshing fails', async () => {
    await mount(SellerOrderDetailView)
    state.selectAction('shipped')
    mocks.update.mockResolvedValueOnce({ data: { ...fixture(), fulfillment_status: 'shipped', allowed_actions: ['delivered'] } })
    mocks.get.mockRejectedValueOnce(new Error('Network unavailable'))
    await state.perform()
    expect(state.refreshRequired).toBe(true)
    expect(state.error).toContain('The change was saved')
    expect(state.notice).toBe('')
    state.selectAction('delivered')
    await state.perform()
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })
  it('requires a cancellation reason and submits the current order version', async () => {
    await mount(SellerOrderDetailView)
    state.selectAction('cancel')
    await state.perform()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(state.actionError).toContain('reason')
    state.reason = ' Customer request '
    mocks.update.mockResolvedValueOnce({ data: { ...fixture(), order_status: 'cancelled', fulfillment_status: 'cancelled', allowed_actions: [], lock_version: 4 } })
    mocks.get.mockResolvedValueOnce({ data: { ...fixture(), order_status: 'cancelled', fulfillment_status: 'cancelled', allowed_actions: [], lock_version: 4 } })
    await state.perform()
    expect(mocks.update).toHaveBeenCalledWith(12, 'cancel', 3, 'Customer request')
    expect(state.order.order_status).toBe('cancelled')
    expect(state.action).toBe('')
    expect(mocks.get).toHaveBeenCalledTimes(2)
  })
  it('blocks duplicate clicks and unavailable actions', async () => {
    await mount(SellerOrderDetailView)
    state.selectAction('mark-paid')
    await state.perform()
    expect(mocks.update).not.toHaveBeenCalled()
    state.selectAction('shipped')
    let finish
    mocks.update.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const first = state.perform()
    await state.perform()
    expect(mocks.update).toHaveBeenCalledTimes(1)
    finish({ data: { ...fixture(), fulfillment_status: 'shipped', allowed_actions: ['delivered'] } })
    await first
    expect(state.busy).toBe(false)
  })
  it('reloads the order on a stale-version conflict without repeating the action', async () => {
    await mount(SellerOrderDetailView)
    state.selectAction('shipped')
    mocks.update.mockRejectedValueOnce(Object.assign(new Error('Order changed'), { status: 409 }))
    mocks.get.mockResolvedValueOnce({ data: { ...fixture(), lock_version: 4, fulfillment_status: 'shipped', allowed_actions: ['delivered'] } })
    await state.perform()
    expect(state.order.lock_version).toBe(4)
    expect(state.action).toBe('')
    expect(state.error).toContain('latest order')
    expect(mocks.update).toHaveBeenCalledTimes(1)
  })
  it('discards action responses after the viewed order changes', async () => {
    await mount(SellerOrderDetailView)
    let finish
    mocks.update.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    state.selectAction('shipped')
    const pending = state.perform()
    mocks.get.mockResolvedValueOnce({ data: { ...fixture(), id: 99 } })
    await state.load()
    finish({ data: { ...fixture(), id: 12, fulfillment_status: 'shipped' } })
    await pending
    expect(state.order.id).toBe(99)
  })
})
