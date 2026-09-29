const { countries } = require('../../shared/checkout-geography.json')
const byCode = new Map(countries.map(country => [country.code, country]))

function normalizeGeography(address) {
    const code = address.country_code === 'UK' ? 'GB' : address.country_code
    const country = byCode.get(code)
    const province = country?.provinces.find(region => region.name === address.province_state)
    return { ...address, country_name: country?.name || '', province_code: province?.code || '' }
}

module.exports = { normalizeGeography }
