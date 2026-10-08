export const CHECKOUT_ADDRESS_STORAGE_KEY = 'runstore-checkout-address-v1'

export function normalizeCheckoutAddress(value = {}) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const text = (key) => typeof source[key] === 'string' ? source[key] : ''
  return {
    first_name: text('first_name'),
    last_name: text('last_name'),
    phone: text('phone'),
    email: text('email'),
    country_code: text('country_code'),
    country_name: text('country_name'),
    province_state: text('province_state'),
    province_code: text('province_code'),
    city: text('city'),
    zip_code: text('zip_code'),
    street: text('street'),
    house_number: text('house_number'),
    apartment: text('apartment'),
    ward: text('ward')
  }
}
