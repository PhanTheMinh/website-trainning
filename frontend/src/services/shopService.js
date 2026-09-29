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

export function getShippingMethods(params = {}) {
  return apiClient.get(`/api/shops/me/shipping-methods${querySuffix(params)}`)
}

export function createShippingMethod(method) {
  return apiClient.post('/api/shops/me/shipping-methods', method)
}

export function updateShippingMethodStatus(methodId, status) {
  return apiClient.patch(
    `/api/shops/me/shipping-methods/${encodeURIComponent(methodId)}/status`,
    { status }
  )
}

export function getPaymentMethods(params = {}) {
  return apiClient.get(`/api/shops/me/payment-methods${querySuffix(params)}`)
}

export function getPaymentMethod(methodId) {
  return apiClient.get(`/api/shops/me/payment-methods/${encodeURIComponent(methodId)}`)
}

export function createPaymentMethod(method) {
  return apiClient.post('/api/shops/me/payment-methods', method)
}

export function updatePaymentMethod(methodId, method) {
  return apiClient.patch(
    `/api/shops/me/payment-methods/${encodeURIComponent(methodId)}`,
    method
  )
}

export function updatePaymentMethodStatus(methodId, isActive) {
  return apiClient.patch(
    `/api/shops/me/payment-methods/${encodeURIComponent(methodId)}/status`,
    { is_active: isActive }
  )
}

export function deletePaymentMethod(methodId) {
  return apiClient.delete(`/api/shops/me/payment-methods/${encodeURIComponent(methodId)}`)
}

export function getCountries(params = {}) {
  return apiClient.get(`/api/shops/me/countries${querySuffix(params)}`)
}

export function createCountry(country) {
  return apiClient.post('/api/shops/me/countries', country)
}

export function deleteCountry(countryId) {
  return apiClient.delete(`/api/shops/me/countries/${encodeURIComponent(countryId)}`)
}

export function getShippingRates(params = {}) {
  return apiClient.get(`/api/shops/me/shipping-rates${querySuffix(params)}`)
}

export function getShippingRate(rateId) {
  return apiClient.get(`/api/shops/me/shipping-rates/${encodeURIComponent(rateId)}`)
}

export function createShippingRate(rate) {
  return apiClient.post('/api/shops/me/shipping-rates', rate)
}

export function updateShippingRate(rateId, rate) {
  return apiClient.patch(
    `/api/shops/me/shipping-rates/${encodeURIComponent(rateId)}`,
    rate
  )
}

export function deleteShippingRate(rateId) {
  return apiClient.delete(`/api/shops/me/shipping-rates/${encodeURIComponent(rateId)}`)
}
