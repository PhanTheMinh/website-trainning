import { apiClient } from './apiClient'

export function login(payload) {
  return apiClient.post('/auth/login', payload)
}

export function register(payload) {
  return apiClient.post('/auth/register', payload)
}

export function getProfile(token) {
  return apiClient.get('/auth/profile', {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
}

export function updateProfile(payload, token) {
  return apiClient.put('/auth/profile', payload, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  })
}
