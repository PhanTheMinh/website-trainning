import { apiClient } from './apiClient.js'
const base = '/api/shops/me/orders'
export const getSellerOrders = params => apiClient.get(`${base}?${new URLSearchParams(params)}`)
export const getSellerOrder = id => apiClient.get(`${base}/${encodeURIComponent(id)}`)
export function updateSellerOrder(id, action, version, reason = '') {
  const path = `${base}/${encodeURIComponent(id)}`
  if (['processing', 'shipped', 'delivered'].includes(action)) {
    return apiClient.patch(`${path}/fulfillment`, { version, fulfillment_status: action })
  }
  if (!['confirm', 'cancel', 'mark-paid'].includes(action)) throw new Error('Unknown order action')
  return apiClient.post(`${path}/${action}`, { version, ...(action === 'cancel' ? { reason } : {}) })
}
