import { apiClient } from './apiClient.js'

export function createProduct(formData) {
  return apiClient.post('/api/products', formData)
}

export function getProduct(productId) {
  return apiClient.get(`/api/products/${productId}`)
}

export function getProducts(category = '') {
  const query = category
    ? `?${new URLSearchParams({ category }).toString()}`
    : ''

  return apiClient.get(`/api/products${query}`)
}
