import { apiClient } from './apiClient.js'


export function getCheckoutShippingOptions(shopIds, countryCode = null) {
  return apiClient.post('/api/checkout/shipping-options', {
    shop_ids: shopIds,
    country_code: countryCode
  })
}

export function getCheckoutDraft(token) {
  return apiClient.get(`/api/checkout/${encodeURIComponent(token)}`)
}

export function saveCheckoutDraft(token, draft, options) {
  return apiClient.patch(`/api/checkout/${encodeURIComponent(token)}`, draft, options)
}
export function createCheckout(items, requestId) {
  return apiClient.post('/api/checkout', { items, request_id: requestId })
}
export function listCheckouts(page = 1) {
  return apiClient.get(`/api/checkout?page=${page}`)
}
export function getStreetSuggestions(address, options) {
  return apiClient.post('/api/checkout/street-suggestions', address, options)
}
export function getStreetList(location, options) {
  return apiClient.post('/api/checkout/street-list', location, options)
}
