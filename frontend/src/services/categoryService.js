import { apiClient } from './apiClient.js'

export function getCategories() {
  return apiClient.get('/api/categories')
}
