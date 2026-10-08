import { describe, expect, it, vi } from 'vitest'
import { goBack } from './backNavigation.js'
describe('Back navigation', () => {
  it('returns to the previous application page', () => {
    const router = { back: vi.fn(), replace: vi.fn() }
    goBack(router, { name: 'cart' }, { back: '/products/10' })
    expect(router.back).toHaveBeenCalledOnce()
    expect(router.replace).not.toHaveBeenCalled()
  })
  it('uses the fallback when the page was opened directly', () => {
    const router = { back: vi.fn(), replace: vi.fn() }
    goBack(router, { name: 'cart' }, { back: null })
    expect(router.replace).toHaveBeenCalledWith({ name: 'cart' })
    expect(router.back).not.toHaveBeenCalled()
  })
  it('does not navigate outside the application', () => {
    const router = { back: vi.fn(), replace: vi.fn() }
    goBack(router, { name: 'checkout' }, { back: '//example.com' })
    expect(router.replace).toHaveBeenCalledWith({ name: 'checkout' })
    expect(router.back).not.toHaveBeenCalled()
  })
})
