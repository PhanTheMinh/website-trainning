import { apiClient } from './apiClient'

export function checkBackendConnection(endpoint = '/health') {
  return apiClient.get(endpoint)
}
