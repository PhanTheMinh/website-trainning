import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, nextTick, ssrContextKey } from 'vue'
import StreetAddressInput from './StreetAddressInput.vue'
const mocks = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('../services/checkoutService.js', () => ({ getStreetList: mocks.list }))
const renderer = createRenderer({
  createElement: tag => ({ tag, children: [] }), createText: text => ({ text }), createComment: text => ({ text }),
  insert: (node, parent) => { node.parent = parent; parent.children.push(node) }, remove: () => {},
  setText: () => {}, setElementText: () => {}, parentNode: () => null, nextSibling: () => null, patchProp: () => {}
})
let app, state, onUpdate
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve(); await nextTick() }
async function mount(props = {}) {
  onUpdate = vi.fn()
  app = renderer.createApp({ ...StreetAddressInput, render: () => null }, { modelValue: '', country: 'VN', province: 'Hải Dương', city: 'Kinh Môn', 'onUpdate:modelValue': onUpdate, ...props })
  app.provide(ssrContextKey, { modules: new Set() })
  app.mount({ children: [] })
  state = app._instance.setupState
  await settle()
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.list.mockResolvedValue({ data: { available: true, streets: ['Nguyễn Trãi', 'Quang Trung'] } })
})
afterEach(() => { app?.unmount(); app = null })
describe('Street list selection', () => {
  it('loads the whole city list without typing and opens all choices with the arrow', async () => {
    await mount()
    expect(mocks.list.mock.calls[0][0]).toEqual({ country_code: 'VN', province_state: 'Hải Dương', city: 'Kinh Môn' })
    expect(state.panelOpen).toBe(false)
    state.openPanel()
    expect(state.suggestions).toEqual([{ street: 'Nguyễn Trãi' }, { street: 'Quang Trung' }])
    expect(mocks.list).toHaveBeenCalledTimes(1)
  })
  it('filters the downloaded list locally, including unaccented search', async () => {
    await mount()
    state.inputStreet({ target: { value: 'Nguyen' } })
    app._instance.props.modelValue = 'Nguyen'
    await settle()
    expect(state.suggestions).toEqual([{ street: 'Nguyễn Trãi' }])
    expect(mocks.list).toHaveBeenCalledTimes(1)
    state.openPanel()
    expect(state.suggestions).toHaveLength(2)
  })
  it('loads any other country/province/city rather than a fixed Vietnamese location', async () => {
    await mount({ country: 'US', province: 'Massachusetts', city: 'Boston' })
    expect(mocks.list.mock.calls[0][0]).toEqual({ country_code: 'US', province_state: 'Massachusetts', city: 'Boston' })
  })
  it('does not request a list until a country and city exist', async () => {
    await mount({ city: '' })
    state.openPanel()
    expect(mocks.list).not.toHaveBeenCalled()
    expect(state.message).toContain('Select a country and city')
  })
  it('changes only street when a choice is selected and retains the downloaded list', async () => {
    await mount()
    state.selectStreet({ target: { value: 'Quang Trung' } })
    expect(onUpdate).toHaveBeenCalledWith('Quang Trung')
    expect(app._instance.props.city).toBe('Kinh Môn')
    expect(state.panelOpen).toBe(false)
    state.openPanel()
    expect(state.suggestions).toHaveLength(2)
  })
  it('ignores obsolete results when the city changes', async () => {
    let resolve
    mocks.list.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    await mount()
    const signal = mocks.list.mock.calls[0][1].signal
    app._instance.props.city = 'Chí Linh'
    await settle()
    resolve({ data: { streets: ['Wrong city street'] } })
    await settle()
    expect(signal.aborted).toBe(true)
    expect(mocks.list.mock.calls[1][0].city).toBe('Chí Linh')
    expect(state.streets).not.toContain('Wrong city street')
  })
  it('supports keyboard choice and leaves unmatched manual text usable', async () => {
    await mount()
    state.openPanel()
    state.moveOption(1)
    const event = { preventDefault: vi.fn() }
    state.acceptOption(event)
    expect(onUpdate).toHaveBeenCalledWith('Nguyễn Trãi')
    expect(event.preventDefault).toHaveBeenCalled()
    state.inputStreet({ target: { value: 'Unmapped road' } })
    expect(onUpdate).toHaveBeenLastCalledWith('Unmapped road')
  })
  it('shows missing boundary/provider errors honestly and supports retry', async () => {
    mocks.list.mockResolvedValueOnce({ data: { streets: [], reason: 'boundary_unavailable' } })
    await mount()
    expect(state.message).toContain('boundary')
    mocks.list.mockRejectedValueOnce(new Error('Offline'))
    await state.loadList()
    expect(state.message).toContain('Retry')
    await state.loadList()
    expect(state.streets).toHaveLength(2)
  })
  it('aborts pending requests on unmount', async () => {
    mocks.list.mockImplementationOnce(() => new Promise(() => {}))
    await mount()
    const signal = mocks.list.mock.calls[0][1].signal
    app.unmount()
    expect(signal.aborted).toBe(true)
    app = null
  })
})
