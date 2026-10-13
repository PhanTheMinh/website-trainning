import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, createSSRApp, ssrContextKey, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import CheckoutView from './CheckoutView.vue'

const mocks = vi.hoisted(() => ({ get: vi.fn(), save: vi.fn(), list: vi.fn(), cities: vi.fn(), createOrder: vi.fn(), push: vi.fn(), leave: null, update: null }))
vi.mock('../services/orderService.js', () => ({ createOrder: mocks.createOrder }))
vi.mock('../utils/checkoutRegions.js', async importOriginal => ({
  ...await importOriginal(), getCheckoutCities: mocks.cities
}))
vi.mock('../services/checkoutService.js', () => ({
  getCheckoutDraft: mocks.get, saveCheckoutDraft: mocks.save, listCheckouts: mocks.list
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { checkoutToken: 'token-a' } }),
  useRouter: () => ({ push: mocks.push }),
  onBeforeRouteLeave: callback => { mocks.leave = callback },
  onBeforeRouteUpdate: callback => { mocks.update = callback },
  RouterLink: { template: '<span><slot /></span>' }
}))
// A minimal Vue renderer exercises component state/lifecycle without a browser dependency.
const renderer = createRenderer({
  createElement: tag => ({ tag, children: [] }), createText: text => ({ text }), createComment: text => ({ text }),
  insert: (node, parent) => { node.parent = parent; parent.children.push(node) },
  remove: node => { if (node.parent) node.parent.children = node.parent.children.filter(child => child !== node) },
  setText: (node, text) => { node.text = text }, setElementText: (node, text) => { node.text = text },
  parentNode: node => node.parent, nextSibling: () => null,
  patchProp: (node, key, previous, value) => { node[key] = value }
})
let container
let app
let state
let storage
const data = version => ({ token: 'token-a', version, is_completed: false,
  shipping_address: { email: 'saved@example.com', city: 'Hanoi' }, shipping_selections: {},
  items: [], destinations: [], shipping: [], issues: [], total: { subtotal: 100, shipping_fee: null, amount_due: null } })
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); await nextTick() }
async function mount(userId = 1) {
  app = renderer.createApp({ ...CheckoutView, render: () => null }, { currentUser: { id: userId }, sessionLoading: false })
  app.provide(ssrContextKey, { modules: new Set() })
  app.mount(container)
  state = app._instance.setupState
  await settle()
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  container = { children: [] }
  storage = new Map()
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('document', { addEventListener() {}, removeEventListener() {} })
  vi.stubGlobal('localStorage', { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) })
  mocks.get.mockResolvedValue({ data: data(1) })
  mocks.cities.mockResolvedValue([])
  mocks.save.mockImplementation(async (token, patch) => ({ data: { ...data(patch.version + 1), shipping_address: patch.shipping_address } }))
})
afterEach(() => { app?.unmount(); vi.useRealTimers(); vi.unstubAllGlobals() })

describe('Checkout autosave', () => {
  it('keeps shop products and shipping totals independent when shipping changes', async () => {
    mocks.get.mockResolvedValueOnce({ data: { ...data(1),
      items: [
        { product_id: 1, variant_id: 2, shop_id: 10, name: 'Running shoe', quantity: 2, price: 100.25, shop: { name: 'Shop A' } },
        { product_id: 3, variant_id: 4, shop_id: 20, name: 'Running shirt', quantity: 1, price: 50, shop: { name: 'Shop B' } }
      ], destinations: [{ country_code: 'VN' }], shipping_selections: { 10: 3, 20: 5 },
      shipping: [
        { shop_id: 10, options: [{ rate_id: 3, name: 'Standard', fixed_fee: 20 }, { rate_id: 4, name: 'Express', fixed_fee: 35 }] },
        { shop_id: 20, options: [{ rate_id: 5, name: 'Standard', fixed_fee: 10 }] }
      ] } })
    await mount()
    const [shopA, shopB] = state.shopGroups
    expect(shopA.items.map(item => item.name)).toEqual(['Running shoe'])
    expect(shopB.items.map(item => item.name)).toEqual(['Running shirt'])
    expect(state.shopTotal(shopA)).toBe(220.5)
    expect(state.shopTotal(shopB)).toBe(60)
    expect(state.orderTotal).toBe(280.5)
    state.chooseShipping(10, 4)
    expect(state.shopTotal(shopA)).toBe(235.5)
    expect(state.shopTotal(shopB)).toBe(60)
    expect(state.orderTotal).toBe(295.5)
    state.selectedRates = { 20: 5 }
    expect(state.shopTotal(shopA)).toBeNull()
    expect(state.shippingReady).toBe(false)
  })
  it('renders the simplified address form without detailed address fields or street lookups', async () => {
    mocks.get.mockResolvedValueOnce({ data: { ...data(1), items: [{ product_id: 1, variant_id: 2, shop_id: 10, name: 'Test shoe', quantity: 1, price: 100 }] } })
    await mount()
    const html = await renderToString(createSSRApp({ ...CheckoutView, setup: () => state }, { currentUser: { id: 1 }, sessionLoading: false }))
    for (const label of ['Email *', 'Phone *', 'Country *', 'Province/State', 'City *', 'Zip Code']) expect(html).toContain(label)
    for (const label of ['Street *', 'House number', 'Apartment / Unit', 'Ward / District', 'street-options']) expect(html).not.toContain(label)
  })
  const complete = version => ({ ...data(version),
    items: [{ product_id: 1, variant_id: 2, shop_id: 10, quantity: 2, price: 100, stock_quantity: 5 }],
    shipping_selections: { 10: 3 },
    shipping: [{ shop_id: 10, selected: { rate_id: 3, fixed_fee: 20 }, options: [{ rate_id: 3, fixed_fee: 20 }] }],
    payment_selection: { id: 4 }, payment_options: [{ id: 4 }],
    total: { subtotal: 200, shipping_fee: 20, amount_due: 220 } })
  it('creates orders from the saved checkout version and navigates to its order list', async () => {
    mocks.get.mockResolvedValue({ data: complete(1) })
    mocks.save.mockResolvedValue({ data: complete(2) })
    mocks.createOrder.mockResolvedValue({ data: { orders: [{ id: 8, items: [{ product_id: 1, product_variant_id: 2, quantity: 2 }] }] } })
    await mount()
    state.address.street = 'New street'
    await state.placeOrder()
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(mocks.createOrder.mock.calls[0][0]).toMatchObject({ checkout_token: 'token-a', version: 2 })
    expect(mocks.push).toHaveBeenCalledWith({ name: 'checkout-orders', params: { checkoutToken: 'token-a' } })
    expect(state.completed).toBe(true)
    expect(storage.size).toBe(0)
  })
  it('retries a lost response with the same request and prevents duplicate simultaneous submission', async () => {
    mocks.get.mockResolvedValue({ data: complete(1) })
    let reject
    mocks.createOrder.mockImplementationOnce(() => new Promise((resolve, failure) => { reject = failure }))
    await mount()
    const submitting = state.placeOrder()
    await settle()
    await state.placeOrder()
    expect(mocks.createOrder).toHaveBeenCalledTimes(1)
    reject(new Error('Offline'))
    await submitting
    expect(state.uncertainOrder).toBe(true)
    const first = { ...mocks.createOrder.mock.calls[0][0] }
    mocks.createOrder.mockResolvedValue({ data: { orders: [] } })
    await state.placeOrder()
    expect(mocks.createOrder.mock.calls[1][0]).toEqual(first)
    expect(state.uncertainOrder).toBe(false)
  })
  it('requires confirmation when an autosave changes the displayed quote', async () => {
    mocks.get.mockResolvedValue({ data: complete(1) })
    mocks.save.mockResolvedValue({ data: { ...complete(2), items: [{ ...complete(2).items[0], price: 110 }] } })
    await mount()
    state.address.street = 'Changed'
    await state.placeOrder()
    expect(mocks.createOrder).not.toHaveBeenCalled()
    expect(state.orderMessage).toContain('Review')
  })
  it('refreshes and re-saves a server requote without automatically creating an order', async () => {
    mocks.get.mockResolvedValue({ data: complete(1) })
    mocks.save.mockResolvedValue({ data: complete(2) })
    mocks.createOrder.mockRejectedValue(Object.assign(new Error('Changed price'), { status: 409, code: 'ORDER_REQUOTE_REQUIRED' }))
    await mount()
    await state.placeOrder()
    expect(mocks.createOrder).toHaveBeenCalledTimes(1)
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(state.completed).toBe(false)
    expect(state.orderMessage).toContain('No order was created')
    expect(storage.size).toBe(0)
  })
  it('reopens completed checkouts without trying to place a new order', async () => {
    mocks.get.mockResolvedValue({ data: { ...complete(3), is_completed: true, order_ids: [8] } })
    await mount()
    expect(state.hasOrders).toBe(true)
    await state.placeOrder()
    expect(mocks.createOrder).not.toHaveBeenCalled()
  })
  it('recovers unavailable COD without losing edits and saves a cleared selection', async () => {
    mocks.get.mockResolvedValue({ data: { ...data(1), payment_options: [], payment_selection: null } })
    await mount()
    state.selectedPaymentId = 5
    state.address.city = 'Unsaved city'
    mocks.save.mockRejectedValueOnce(Object.assign(new Error('COD unavailable'), { status: 409, code: 'PAYMENT_METHOD_UNAVAILABLE' }))
    await state.flush()
    expect(state.selectedPaymentId).toBeNull()
    expect(state.address.city).toBe('Unsaved city')
    expect(mocks.save.mock.calls[1][1]).toMatchObject({ payment_method_id: null, shipping_address: { city: 'Unsaved city' } })
    expect(state.status).toBe('Saved')
    expect(state.paymentNotice).toContain('no longer available')
    expect(storage.size).toBe(0)
  })
  it('does not overwrite another tab while recovering unavailable COD', async () => {
    await mount()
    state.selectedPaymentId = 5
    state.address.city = 'My local change'
    mocks.save.mockRejectedValueOnce(Object.assign(new Error('COD unavailable'), { status: 409, code: 'PAYMENT_METHOD_UNAVAILABLE' }))
    mocks.get.mockResolvedValueOnce({ data: data(2) })
    expect(await state.flush()).toBe(false)
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(state.address.city).toBe('My local change')
    expect(state.error).toContain('another tab')
  })
  it('preserves the backup if refreshing unavailable payment methods fails', async () => {
    await mount()
    state.selectedPaymentId = 5
    state.address.city = 'Keep this city'
    mocks.save.mockRejectedValueOnce(Object.assign(new Error('COD unavailable'), { status: 409, code: 'PAYMENT_METHOD_UNAVAILABLE' }))
    mocks.get.mockRejectedValueOnce(new Error('Offline'))
    expect(await state.flush()).toBe(false)
    expect(state.address.city).toBe('Keep this city')
    expect(storage.size).toBe(1)
    expect(mocks.save).toHaveBeenCalledTimes(1)
  })
  it('keeps checkout quantities from the saved cart without exposing quantity editing', async () => {
    mocks.get.mockResolvedValueOnce({ data: { ...data(1), items: [{ product_id: 1, variant_id: 2, price: 125000, quantity: 2, stock_quantity: 9999 }], total: { subtotal: 250000, shipping_fee: 30000, amount_due: 280000 } } })
    await mount()
    expect(state.checkoutItems[0].quantity).toBe(2)
    expect(state.itemTotal).toBe(250000)
    expect(state.orderTotal).toBe(280000)
    expect(state.shippingReady).toBe(true)
    expect(mocks.save).not.toHaveBeenCalled()
    expect(state.changeQuantity).toBeUndefined()
    expect(state.quantityInput).toBeUndefined()
  })
  it('combines duplicate city names and postcode entries, and supports manual selections', async () => {
    await mount()
    state.address.country_code = 'US'
    mocks.cities.mockResolvedValueOnce([{ name: 'Springfield', zip_codes: ['01101', '01102'] }, { name: 'Springfield', zip_codes: ['01102', '01103'] }])
    state.address.province_state = 'Massachusetts'
    await settle()
    expect(state.cityNames).toEqual(['Springfield'])
    expect(state.zipOptions).toEqual(['01101', '01102', '01103'])
    expect(state.address.zip_code).toBe('')
    state.zipSelection = '01102'
    expect(state.address.zip_code).toBe('01102')
    state.citySelection = '__manual__'
    state.address.city = 'Other city'
    state.zipSelection = '__manual__'
    state.address.zip_code = '01234'
    expect(state.citySelection).toBe('__manual__')
    expect(state.zipSelection).toBe('__manual__')
    expect(state.address.zip_code).toBe('01234')
  })
  it('tries a fallback image when the primary image cannot be displayed', async () => {
    await mount()
    const item = { image_url: '/uploads/missing.png', image_urls: ['/uploads/missing.png', '/uploads/fallback.png'] }
    expect(state.imageFor(item)).toContain('/uploads/missing.png')
    state.imageFailed(item)
    expect(state.imageFor(item)).toContain('/uploads/fallback.png')
    state.imageFailed(item)
    expect(state.imageFor(item)).toBe('')
    expect(state.absoluteImageUrl('src/uploads/product.png')).toContain('/uploads/product.png')
  })
  it('fills the only city and zip and saves names and codes', async () => {
    await mount()
    state.address.country_code = 'VN'
    mocks.cities.mockResolvedValueOnce([{ name: 'Hải Dương', zip_codes: ['03127'] }])
    state.address.province_state = 'Hải Dương'
    await settle()
    expect(state.address).toMatchObject({ country_name: 'Việt Nam', country_code: 'VN', province_code: 'HD', city: 'Hải Dương', zip_code: '03127' })
    expect(mocks.save.mock.calls.at(-1)[1].shipping_address.zip_code).toBe('03127')
  })
  it('does not guess a city or zip when several results exist', async () => {
    await mount()
    state.address.country_code = 'US'
    mocks.cities.mockResolvedValueOnce([{ name: 'Los Angeles', zip_codes: ['90001', '90002'] }, { name: 'Example', zip_codes: ['01234'] }])
    state.address.province_state = 'California'
    await settle()
    expect(state.address.city).toBe('')
    expect(state.address.zip_code).toBe('')
    state.address.city = 'Los Angeles'
    expect(state.zipOptions).toEqual(['90001', '90002'])
    expect(state.address.zip_code).toBe('')
    state.address.city = 'Example'
    expect(state.address.zip_code).toBe('01234')
  })
  it('flushes a field before the debounce ends and saves a shipping selection immediately', async () => {
    await mount()
    state.address.first_name = 'Linh'
    expect(await state.flush()).toBe(true)
    expect(mocks.save.mock.calls[0][1].shipping_address.first_name).toBe('Linh')
    state.chooseShipping(1, 20)
    await settle()
    expect(mocks.save.mock.calls.at(-1)[1].shipping_selections).toEqual({ 1: 20 })
  })
  it('autosaves a manually entered street without changing item quantities', async () => {
    mocks.get.mockResolvedValueOnce({ data: { ...data(1), items: [{ product_id: 1, variant_id: 2, quantity: 1 }] } })
    mocks.save.mockImplementationOnce(async (token, patch) => ({ data: { ...data(2), shipping_address: patch.shipping_address, items: [{ product_id: 1, variant_id: 2, quantity: 1 }] } }))
    await mount()
    state.address.street = 'Nguyen Van Linh'
    await settle()
    await state.flush()
    expect(mocks.save.mock.calls[0][1].shipping_address.street).toBe('Nguyen Van Linh')
    expect(mocks.save.mock.calls[0][1].items).toBeUndefined()
    expect(state.checkoutItems[0].quantity).toBe(1)
  })
  it('changes province options by country, resets the old selection, and autosaves the new one', async () => {
    await mount()
    state.address.country_code = 'VN'
    expect(state.provinceOptions).toEqual(expect.arrayContaining(['Hà Nội', 'Hải Dương', 'Nam Định']))
    state.address.province_state = 'Hà Nội'
    state.address.country_code = 'US'
    expect(state.address.province_state).toBe('')
    expect(state.provinceOptions).toContain('California')
    expect(state.provinceOptions).not.toContain('Hà Nội')
    state.address.province_state = 'California'
    await vi.advanceTimersByTimeAsync(400)
    expect(mocks.save.mock.calls[0][1].shipping_address).toMatchObject({ country_code: 'US', province_state: 'California' })
    state.address.country_code = 'UK'
    expect(state.provinceOptions).toContain('London')
    expect(state.provinceOptions).not.toContain('California')
    expect(state.provinceOptions).toEqual([...state.provinceOptions].sort(new Intl.Collator('en', { sensitivity: 'base' }).compare))
  })
  it('preserves a saved province on hydration without autosaving', async () => {
    mocks.get.mockResolvedValueOnce({ data: { ...data(1), shipping_address: { country_code: 'VN', province_state: 'Hà Nội' } } })
    await mount()
    expect(state.address.province_state).toBe('Hà Nội')
    expect(state.hasLegacyProvince).toBe(false)
    expect(state.provinceOptions).toEqual([...state.provinceOptions].sort(new Intl.Collator('vi', { sensitivity: 'base' }).compare))
    await vi.advanceTimersByTimeAsync(400)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('hydrates without writing, then debounces typing and saves partial email', async () => {
    await mount()
    expect(state.address.city).toBe('Hanoi')
    await vi.advanceTimersByTimeAsync(500)
    expect(mocks.save).not.toHaveBeenCalled()
    state.address.email = 'a'
    state.address.email = 'ab@'
    await vi.advanceTimersByTimeAsync(400)
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(mocks.save.mock.calls[0][1]).toMatchObject({ version: 1, shipping_address: { email: 'ab@' } })
    expect(state.status).toBe('Saved')
    expect(storage.size).toBe(0)
  })
  it('serializes overlapping edits and flushes the last change on route exit', async () => {
    await mount()
    let resolve
    mocks.save.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    state.address.city = 'First'
    await vi.advanceTimersByTimeAsync(400)
    state.address.city = 'Latest'
    await vi.advanceTimersByTimeAsync(400)
    expect(mocks.save).toHaveBeenCalledTimes(1)
    resolve({ data: { ...data(2), shipping_address: { city: 'First' } } })
    await settle()
    expect(mocks.save).toHaveBeenCalledTimes(2)
    expect(mocks.save.mock.calls[1][1]).toMatchObject({ version: 2, shipping_address: { city: 'Latest' } })
    expect(state.address.city).toBe('Latest')
    state.address.phone = '123'
    expect(await mocks.leave()).toBe(true)
    expect(mocks.save.mock.calls[2][1].shipping_address.phone).toBe('123')
  })
  it('keeps unsaved edits after network failure and retries explicitly', async () => {
    await mount()
    mocks.save.mockRejectedValueOnce(new Error('Offline'))
    state.address.city = 'Offline edit'
    await vi.advanceTimersByTimeAsync(400)
    expect(state.status).toBe('Not saved')
    expect(storage.has('runstore-checkout-pending:1:token-a')).toBe(true)
    expect(await state.flush()).toBe(true)
    expect(state.status).toBe('Saved')
    expect(storage.size).toBe(0)
  })
  it('stops automatic writes on version conflicts', async () => {
    await mount()
    mocks.save.mockRejectedValueOnce(Object.assign(new Error('Changed in another tab'), { status: 409 }))
    state.address.city = 'My edit'
    await vi.advanceTimersByTimeAsync(400)
    state.address.city = 'Still editing'
    await vi.advanceTimersByTimeAsync(400)
    expect(mocks.save).toHaveBeenCalledTimes(1)
    expect(await mocks.leave()).toBe(false)
    expect(state.address.city).toBe('Still editing')
  })
  it('does not restore another account’s local backup', async () => {
    storage.set('runstore-checkout-pending:1:token-a', JSON.stringify({ version: 1, data: { shipping_address: { city: 'Private' }, shipping_selections: {} } }))
    await mount(2)
    expect(state.address.city).toBe('Hanoi')
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('restores and retries a matching pending backup after reopening', async () => {
    storage.set('runstore-checkout-pending:1:token-a', JSON.stringify({ version: 1, data: { shipping_address: { city: 'Recovered' }, shipping_selections: {} } }))
    await mount()
    expect(state.address.city).toBe('Recovered')
    expect(mocks.save.mock.calls[0][1].shipping_address.city).toBe('Recovered')
    expect(state.status).toBe('Saved')
  })
  it('ignores an old account’s in-flight save after switching accounts', async () => {
    await mount()
    let resolve
    mocks.save.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    state.address.city = 'Account one'
    await vi.advanceTimersByTimeAsync(400)
    mocks.get.mockResolvedValueOnce({ data: { ...data(1), shipping_address: { city: 'Account two' } } })
    app._instance.props.currentUser = { id: 2 }
    await settle()
    expect(state.address.city).toBe('Account two')
    resolve({ data: { ...data(2), shipping_address: { city: 'Account one' } } })
    await settle()
    expect(state.address.city).toBe('Account two')
    expect(mocks.save).toHaveBeenCalledTimes(1)
  })
})
