import { apiClient } from './apiClient.js'

function querySuffix(params = {}) {
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value))
    }
  })

  return query.size ? `?${query.toString()}` : ''
}

export function getShop(identifier, options = {}) {
  return apiClient.get(
    `/api/shops/${encodeURIComponent(identifier)}`,
    options
  )
}

export function getShopProducts(identifier, params = {}) {
  return apiClient.get(
    `/api/shops/${encodeURIComponent(identifier)}/products${querySuffix(params)}`
  )
}

export function getMyShop() {
  return apiClient.get('/api/shops/me')
}

export function createShop(shop) {
  return apiClient.post('/api/shops', shop)
}

export function updateMyShop(shop) {
  return apiClient.patch('/api/shops/me', shop)
}
