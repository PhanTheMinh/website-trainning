import { apiClient } from './apiClient.js'

export function createProduct(formData) {
  return apiClient.post('/api/products', formData)
}

export function getProduct(productId) {
  return apiClient.get(`/api/products/${productId}`)
}

export function getProducts(params = {}) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })

  const suffix = query.size ? `?${query.toString()}` : ''
  return apiClient.get(`/api/products${suffix}`)
}

export function getMyProducts(params = {}) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })

  const suffix = query.size ? `?${query.toString()}` : ''

  return apiClient.get(`/api/products/mine${suffix}`)
}

export function deleteMyProduct(productId) {
  return apiClient.delete(`/api/products/mine/${productId}`)
}

export function bulkDeleteMyProducts(productIds) {
  return apiClient.post('/api/products/mine/bulk-delete', {
    ids: productIds
  })
}

export function bulkUpdateMyProductStatus(productIds, status) {
  return apiClient.patch('/api/products/mine/bulk-status', {
    ids: productIds,
    status
  })
}

export function getManagedProduct(productId) {
  return apiClient.get(`/api/products/mine/${productId}`)
}

export function updateManagedProduct(productId, formData) {
  return apiClient.patch(`/api/products/mine/${productId}`, formData)
}

export function getDeletedProducts(params = {}) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })

  const suffix = query.size ? `?${query.toString()}` : ''
  return apiClient.get(`/api/products/mine/trash${suffix}`)
}

export function restoreDeletedProduct(productId) {
  return apiClient.patch(`/api/products/mine/${productId}/restore`, {})
}

export function permanentlyDeleteProduct(productId) {
  return apiClient.delete(`/api/products/mine/${productId}/permanent`)
}

export function updateVariantStock(productId, variantId, stockQuantity) {
  return apiClient.patch(
    `/api/products/${productId}/variants/${variantId}/stock`,
    { stock_quantity: stockQuantity }
  )
}
