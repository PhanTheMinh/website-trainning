const Joi = require('joi')
const geography = require('../../shared/checkout-geography.json')

const schema = Joi.object({
    text: Joi.string().trim().min(3).max(200).required(),
    country_code: Joi.string().uppercase().valid(...geography.countries.map(country => country.code), 'UK').required(),
    province_state: Joi.string().trim().max(100).allow('').default(''),
    city: Joi.string().trim().max(100).required()
}).unknown(false)

function normalize(value) {
    return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

async function suggestStreets(input) {
    const { value, error } = schema.validate(input)
    if (error) throw Object.assign(new Error('Enter a street search, country and city.'), { statusCode: 400 })
    const apiKey = process.env.GEOAPIFY_API_KEY?.trim()
    if (!apiKey) return { available: false, suggestions: [] }
    const country = value.country_code === 'UK' ? 'GB' : value.country_code
    const url = new URL('https://api.geoapify.com/v1/geocode/autocomplete')
    url.search = new URLSearchParams({
        text: [value.text, value.city, value.province_state].filter(Boolean).join(', '),
        type: 'street', filter: `countrycode:${country.toLowerCase()}`,
        format: 'json', limit: '10', lang: country === 'VN' ? 'vi' : 'en', apiKey
    }).toString()
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(4000), redirect: 'error' })
        if (!response.ok) throw new Error('Provider unavailable')
        const data = await response.json()
        if (!Array.isArray(data.results)) throw new Error('Invalid provider response')
        const seen = new Set()
        const suggestions = []
        for (const result of data.results) {
            if (String(result.country_code).toUpperCase() !== country || typeof result.street !== 'string') continue
            // Search context is not a hard boundary: reject other cities/states explicitly.
            if (normalize(result.city) !== normalize(value.city)) continue
            if (value.province_state && normalize(result.state) !== normalize(value.province_state)) continue
            const street = result.street.trim()
            if (!street || street.length > 200 || seen.has(normalize(street))) continue
            seen.add(normalize(street))
            suggestions.push({ street })
        }
        return { available: true, suggestions }
    } catch {
        // Never leak provider URLs (which contain the secret) or block manual checkout.
        throw Object.assign(new Error('Street suggestions are temporarily unavailable. Enter your street manually.'), { statusCode: 503 })
    }
}

module.exports = { suggestStreets }
