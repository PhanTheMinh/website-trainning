import { describe, expect, it } from 'vitest'
import {
  getProductAvailability,
  isDefinitivePurchaseFailure,
  PRODUCT_AVAILABILITY
} from './purchaseAvailability.js'

describe('getProductAvailability', () => {
  it('prioritizes a stopped product over its stale stock data', () => {
    expect(getProductAvailability({
      status: 'unactive',
      available: true,
      variants: [{ status: 'active', stock_quantity: 5 }]
    })).toBe(PRODUCT_AVAILABILITY.STOPPED)
  })

  it('distinguishes an active sold-out product from a stopped product', () => {
    expect(getProductAvailability({
      status: 'active',
      available: false,
      variants: []
    })).toBe(PRODUCT_AVAILABILITY.OUT_OF_STOCK)
  })

  it('falls back to active variant stock when availability is omitted', () => {
    expect(getProductAvailability({
      status: 'active',
      variants: [{ status: 'active', stock_quantity: 2 }]
    })).toBe(PRODUCT_AVAILABILITY.AVAILABLE)
  })

  it('stops purchasing when the product shop is closed', () => {
    expect(getProductAvailability({
      status: 'active',
      available: true,
      shop: { status: 'closed' },
      variants: [{ status: 'active', stock_quantity: 2 }]
    })).toBe(PRODUCT_AVAILABILITY.STOPPED)
  })
})

describe('isDefinitivePurchaseFailure', () => {
  it.each([400, 404, 409])('treats HTTP %s as a definitive cart failure', (status) => {
    expect(isDefinitivePurchaseFailure({ status })).toBe(true)
  })

  it.each([undefined, 0, 429, 500, 503])(
    'keeps the cart intact for transient status %s',
    (status) => {
      expect(isDefinitivePurchaseFailure({ status })).toBe(false)
    }
  )

  it('uses a known API code before the HTTP status', () => {
    expect(isDefinitivePurchaseFailure({
      code: 'SHOP_CLOSED',
      status: 500
    })).toBe(true)
    expect(isDefinitivePurchaseFailure({
      code: 'UNKNOWN_ERROR',
      status: 409
    })).toBe(false)
  })
})
