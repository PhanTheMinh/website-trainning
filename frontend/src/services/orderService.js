import { apiClient } from './apiClient.js'

export const createOrder = data => apiClient.post('/api/orders', data)
export const getOrder = id => apiClient.get(`/api/orders/${encodeURIComponent(id)}`)
export const getCheckoutOrders = token => apiClient.get(`/api/checkout/${encodeURIComponent(token)}/orders`)
