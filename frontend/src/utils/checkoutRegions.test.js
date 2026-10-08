import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { getCheckoutCountry, getCheckoutProvince } from './checkoutRegions.js'

function locations(country, province) {
  const file = getCheckoutProvince(country, province).locations_file
  return JSON.parse(readFileSync(new URL(`../../public/address-data/${file}`, import.meta.url), 'utf8')).cities
}
describe('Checkout reference JSON', () => {
  it('keeps names, application codes and leading-zero postcodes', () => {
    expect(getCheckoutCountry('VN').name).toBe('Việt Nam')
    expect(getCheckoutProvince('VN', 'Hải Dương').code).toBe('HD')
    expect(locations('VN', 'Hải Dương').find(city => city.name === 'Hải Dương').zip_codes).toContain('03127')
  })
  it('provides multiple California cities and complete British postcodes', () => {
    expect(locations('US', 'California').find(city => city.name === 'Los Angeles').zip_codes.length).toBeGreaterThan(1)
    const postcodes = locations('UK', 'London').flatMap(city => city.zip_codes)
    expect(postcodes.length).toBeGreaterThan(0)
    expect(postcodes.every(code => /^[A-Z0-9]{2,4} [0-9][A-Z]{2}$/.test(code))).toBe(true)
  })
})
