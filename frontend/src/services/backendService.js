import { apiClient } from './apiClient'

export function checkBackendConnection(endpoint = '/health') {
  return apiClient.get(endpoint)
}

export function getUsers() {
  return apiClient.get('/users')
}

export function getProducts() {
  return apiClient.get('/products')
}
