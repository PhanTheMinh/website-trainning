import geography from '../../../shared/checkout-geography.json'

// Address labels come from country-region-data (MIT); keep persisted names unchanged.
const regionsByCountry = new Map(geography.countries.map(country => [
  country.code,
  [...new Set(country.provinces.map(region => region.name))].sort(
    new Intl.Collator(country.code === 'VN' ? 'vi' : 'en', { sensitivity: 'base' }).compare
  )
]))

export function getCheckoutRegions(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase()
  return regionsByCountry.get(code === 'UK' ? 'GB' : code) || []
}

export function getCheckoutCountry(code) {
  return geography.countries.find(country => country.code === (code === 'UK' ? 'GB' : code))
}
export function getCheckoutProvince(countryCode, name) {
  return getCheckoutCountry(countryCode)?.provinces.find(province => province.name === name)
}
const cached = new Map()
export async function getCheckoutCities(countryCode, provinceName) {
  const path = getCheckoutProvince(countryCode, provinceName)?.locations_file
  if (!path) return []
  if (cached.has(path)) return cached.get(path)
  const response = await fetch(`${import.meta.env.BASE_URL}address-data/${path}`)
  if (!response.ok) throw new Error('Could not load City/Zip choices. Please retry or enter your address manually.')
  const data = await response.json()
  const cities = data.cities.sort((a, b) => a.name.localeCompare(b.name, countryCode === 'VN' ? 'vi' : 'en'))
  cached.set(path, cities)
  return cities
}
