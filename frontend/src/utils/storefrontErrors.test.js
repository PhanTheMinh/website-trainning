import { describe, expect, it } from 'vitest'
import {
  getProductLoadError,
  getPurchaseFailureMessage,
  getShopLoadError,
  STOREFRONT_ERROR
} from './storefrontErrors.js'

describe('storefront API error messages', () => {
  it('distinguishes a temporarily closed shop from a missing product', () => {
    expect(getProductLoadError({
      code: STOREFRONT_ERROR.SHOP_CLOSED
    })).toContain('tạm đóng')
    expect(getProductLoadError({
      code: STOREFRONT_ERROR.PRODUCT_NOT_FOUND
    })).toContain('không tồn tại')
  })

  it('maps purchase failures to a specific customer-facing reason', () => {
    expect(getPurchaseFailureMessage({
      code: STOREFRONT_ERROR.INSUFFICIENT_STOCK
    })).toContain('đủ số lượng')
    expect(getPurchaseFailureMessage({
      code: STOREFRONT_ERROR.VARIANT_UNAVAILABLE
    })).toContain('Phiên bản')
  })

  it('keeps useful fallbacks for legacy and transient responses', () => {
    expect(getShopLoadError({ status: 404 })).toContain('không tồn tại')
    expect(getPurchaseFailureMessage({}, 'Thử lại sau.')).toBe('Thử lại sau.')
  })
})

