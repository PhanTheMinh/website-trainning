import { STOREFRONT_ERROR } from './storefrontErrors.js'

export const PRODUCT_AVAILABILITY = Object.freeze({
  AVAILABLE: 'available',
  OUT_OF_STOCK: 'out-of-stock',
  STOPPED: 'stopped'
})

const DEFINITIVE_PURCHASE_CODES = new Set([
  STOREFRONT_ERROR.INSUFFICIENT_STOCK,
  STOREFRONT_ERROR.PRODUCT_OWNER_UNAVAILABLE,
  STOREFRONT_ERROR.PRODUCT_STOPPED,
  STOREFRONT_ERROR.SHOP_CLOSED,
  STOREFRONT_ERROR.SHOP_UNAVAILABLE,
  STOREFRONT_ERROR.VARIANT_UNAVAILABLE
])

export function getProductAvailability(product) {
  if (
    !product ||
    product.status !== 'active' ||
    (product.shop && product.shop.status !== 'active')
  ) {
    return PRODUCT_AVAILABILITY.STOPPED
  }

  if (product.available === false) {
    return PRODUCT_AVAILABILITY.OUT_OF_STOCK
  }

  if (product.available === true) {
    return PRODUCT_AVAILABILITY.AVAILABLE
  }

  const hasPurchasableVariant = (product.variants || []).some(
    (variant) => variant.status === 'active' && variant.stock_quantity > 0
  )

  return hasPurchasableVariant
    ? PRODUCT_AVAILABILITY.AVAILABLE
    : PRODUCT_AVAILABILITY.OUT_OF_STOCK
}

export function isDefinitivePurchaseFailure(error) {
  if (error?.code) {
    return DEFINITIVE_PURCHASE_CODES.has(error.code)
  }

  return [400, 404, 409].includes(Number(error?.status))
}
