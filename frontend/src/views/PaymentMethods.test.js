import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, ssrContextKey, nextTick } from 'vue'
import PaymentMethodListView from './PaymentMethodListView.vue'
import PaymentMethodFormView from './PaymentMethodFormView.vue'

const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), status: vi.fn(), push: vi.fn(), route: { params: {}, query: {} } }))
vi.mock('../services/shopService.js', () => ({ getPaymentMethods: mocks.list, getPaymentMethod: mocks.get, createPaymentMethod: mocks.create, updatePaymentMethod: mocks.update, deletePaymentMethod: mocks.remove, updatePaymentMethodStatus: mocks.status }))
vi.mock('vue-router', () => ({ useRoute: () => mocks.route, useRouter: () => ({ push: mocks.push }), RouterLink: { render: () => null } }))
const renderer = createRenderer({
  createElement: tag => ({ tag, children: [] }), createText: text => ({ text }), createComment: text => ({ text }),
  insert: (node, parent) => { node.parent = parent; parent.children.push(node) },
  remove: node => { if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node) },
  setText: (node, text) => { node.text = text }, setElementText: (node, text) => { node.text = text },
  parentNode: node => node.parent, nextSibling: () => null,
  patchProp: (node, key, previous, value) => { node[key] = value }
})
let app
const method = () => ({ id: 1, name: 'Existing seller name', payment_data: { type: 'cod', description: 'Existing description', instructions: 'Exact instructions' }, is_active: true })
async function settle() { for (let i = 0; i < 10; i++) await Promise.resolve(); await nextTick() }
async function mount(component, user = { id: 1 }) {
  app = renderer.createApp({ ...component, render: () => null }, { currentUser: user })
  app.provide(ssrContextKey, { modules: new Set() })
  app.mount({ children: [] })
  await settle()
  return app._instance.setupState
}
beforeEach(() => {
  vi.resetAllMocks()
  mocks.route.params = {}
  mocks.route.query = {}
  mocks.list.mockResolvedValue({ data: [method()], pagination: { page: 1, limit: 8, totalItems: 1, totalPages: 1 } })
  mocks.get.mockResolvedValue({ data: method() })
  mocks.create.mockResolvedValue({ data: method() })
  mocks.update.mockResolvedValue({ data: method() })
  mocks.remove.mockResolvedValue({})
  mocks.status.mockResolvedValue({ data: { ...method(), is_active: false } })
})
afterEach(() => app?.unmount())
describe('Payment UI preserves shop API behavior', () => {
  it('ignores an older search response', async () => {
    const state = await mount(PaymentMethodListView)
    let resolve
    mocks.list.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const older = state.load()
    mocks.list.mockResolvedValueOnce({ data: [{ ...method(), name: 'Newest' }], pagination: { page: 1, limit: 8, totalItems: 1, totalPages: 1 } })
    await state.load()
    resolve({ data: [method()], pagination: { page: 1, limit: 8, totalItems: 1, totalPages: 1 } })
    await older
    expect(state.methods[0].name).toBe('Newest')
  })
  it('ignores the previous edit record when another record loads first', async () => {
    mocks.route.params = { id: '1' }
    let resolve
    mocks.get.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const state = await mount(PaymentMethodFormView)
    mocks.route.params = { id: '2' }
    mocks.get.mockResolvedValueOnce({ data: { ...method(), id: 2, name: 'Second' } })
    await state.load()
    resolve({ data: method() })
    await settle()
    expect(state.form.name).toBe('Second')
    await state.submit()
    expect(mocks.update.mock.calls[0][0]).toBe('2')
    expect(mocks.update.mock.calls[0][1].name).toBe('Second')
  })
  it('clears private list data after logout and ignores in-flight responses', async () => {
    const state = await mount(PaymentMethodListView)
    let resolve
    mocks.list.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    const loading = state.load()
    app._instance.props.currentUser = null
    await settle()
    resolve({ data: [method()], pagination: { page: 1, limit: 8, totalItems: 1, totalPages: 1 } })
    await loading
    expect(state.methods).toEqual([])
  })
  it('does not request private data for guests', async () => {
    await mount(PaymentMethodListView, null)
    expect(mocks.list).not.toHaveBeenCalled()
  })
  it('loads the current shop and preserves status toggling', async () => {
    const state = await mount(PaymentMethodListView)
    expect(mocks.list).toHaveBeenCalledWith({ page: 1, limit: 8, q: '' })
    await state.toggle(state.methods[0])
    expect(mocks.status).toHaveBeenCalledWith(1, false)
    expect(state.methods[0].is_active).toBe(false)
    expect(state.busyIds.size).toBe(0)
  })
  it('does not delete before confirmation and clears the dialog after deletion', async () => {
    const state = await mount(PaymentMethodListView)
    state.deleteTarget = state.methods[0]
    expect(mocks.remove).not.toHaveBeenCalled()
    await state.remove(state.deleteTarget)
    expect(mocks.remove).toHaveBeenCalledWith(1)
    expect(state.deleteTarget).toBe(null)
  })
  it('keeps a failed deletion available for retry', async () => {
    mocks.remove.mockRejectedValue(new Error('Please try again'))
    const state = await mount(PaymentMethodListView)
    state.deleteTarget = state.methods[0]
    await state.remove(state.deleteTarget)
    expect(state.deleteTarget.id).toBe(1)
    expect(state.deleteError).toBe('Please try again')
    expect(state.busyIds.size).toBe(0)
  })
  it('creates COD with the same payload shape and English defaults', async () => {
    const state = await mount(PaymentMethodFormView)
    await state.submit()
    expect(mocks.create).toHaveBeenCalledWith({ name: 'Cash on delivery', payment_data: { type: 'cod', description: 'Pay in cash when your order arrives.', instructions: null }, is_active: true })
    expect(mocks.push).toHaveBeenCalledWith({ name: 'payment-method-list', query: { saved: '1' } })
  })
  it('retains seller-authored content on edit', async () => {
    mocks.route.params = { id: '1' }
    const state = await mount(PaymentMethodFormView)
    expect(state.form.name).toBe('Existing seller name')
    await state.submit()
    expect(mocks.update).toHaveBeenCalledWith('1', { name: 'Existing seller name', payment_data: method().payment_data, is_active: true })
  })
  it('does not submit a default form if fetching the original failed', async () => {
    mocks.route.params = { id: '999' }
    mocks.get.mockRejectedValue(Object.assign(new Error('Payment method not found'), { status: 404 }))
    const state = await mount(PaymentMethodFormView)
    expect(state.loadFailed).toBe(true)
    await state.submit()
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
