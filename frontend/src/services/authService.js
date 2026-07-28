import { apiClient } from './apiClient'

export function login(payload) {
  return apiClient.post('/api/auth/login', payload)
}

export function register(payload) {
  return apiClient.post('/api/auth/register', payload)
}

export function getProfile() {
  return apiClient.get('/api/users/me')
}

export function updateProfile(payload) {
  return apiClient.put('/api/users/me', payload)
}

export function logout(payload) {
  return apiClient.post('/api/auth/logout', payload)
}
