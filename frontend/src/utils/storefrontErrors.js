export const STOREFRONT_ERROR = Object.freeze({
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  PRODUCT_OWNER_UNAVAILABLE: 'PRODUCT_OWNER_UNAVAILABLE',
  PRODUCT_STOPPED: 'PRODUCT_STOPPED',
  SHOP_CLOSED: 'SHOP_CLOSED',
  SHOP_NOT_FOUND: 'SHOP_NOT_FOUND',
  SHOP_UNAVAILABLE: 'SHOP_UNAVAILABLE',
  VARIANT_UNAVAILABLE: 'VARIANT_UNAVAILABLE'
})

const PRODUCT_LOAD_MESSAGES = Object.freeze({
  [STOREFRONT_ERROR.PRODUCT_NOT_FOUND]:
    'Sản phẩm không tồn tại hoặc chưa được công khai trên cửa hàng.',
  [STOREFRONT_ERROR.PRODUCT_OWNER_UNAVAILABLE]:
    'Shop của sản phẩm hiện không khả dụng.',
  [STOREFRONT_ERROR.SHOP_CLOSED]:
    'Shop đang tạm đóng. Sản phẩm hiện không thể mua.',
  [STOREFRONT_ERROR.SHOP_UNAVAILABLE]:
    'Shop của sản phẩm hiện không khả dụng.'
})

const PURCHASE_MESSAGES = Object.freeze({
  [STOREFRONT_ERROR.INSUFFICIENT_STOCK]:
    'Sản phẩm không còn đủ số lượng.',
  [STOREFRONT_ERROR.PRODUCT_OWNER_UNAVAILABLE]:
    'Shop của sản phẩm hiện không khả dụng.',
  [STOREFRONT_ERROR.PRODUCT_STOPPED]:
    'Sản phẩm đã ngừng bán.',
  [STOREFRONT_ERROR.SHOP_CLOSED]:
    'Shop đang tạm đóng. Sản phẩm hiện không thể mua.',
  [STOREFRONT_ERROR.SHOP_UNAVAILABLE]:
    'Shop của sản phẩm hiện không khả dụng.',
  [STOREFRONT_ERROR.VARIANT_UNAVAILABLE]:
    'Phiên bản này đã ngừng bán hoặc không còn khả dụng.'
})

export function getProductLoadError(error) {
  return PRODUCT_LOAD_MESSAGES[error?.code] || (
    error?.status === 404
      ? PRODUCT_LOAD_MESSAGES[STOREFRONT_ERROR.PRODUCT_NOT_FOUND]
      : error?.message || 'Chưa thể tải sản phẩm. Vui lòng thử lại.'
  )
}

export function getPurchaseFailureMessage(error, fallback = '') {
  return PURCHASE_MESSAGES[error?.code] || fallback || (
    'Sản phẩm vừa thay đổi trạng thái. Vui lòng thử lại.'
  )
}

export function getShopLoadError(error) {
  if (error?.code === STOREFRONT_ERROR.SHOP_CLOSED) {
    return 'Shop đang tạm đóng.'
  }

  if (error?.code === STOREFRONT_ERROR.SHOP_NOT_FOUND || error?.status === 404) {
    return 'Shop không tồn tại hoặc không còn khả dụng.'
  }

  return error?.message || 'Chưa thể tải shop. Vui lòng thử lại.'
}

