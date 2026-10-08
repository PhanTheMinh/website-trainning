const Joi = require('joi')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash, randomUUID } = require('node:crypto')
const geography = require('../../shared/checkout-geography.json')

const schema = Joi.object({
    country_code: Joi.string().uppercase().valid(...geography.countries.map(country => country.code), 'UK').required(),
    province_state: Joi.string().trim().max(100).allow('').default(''),
    city: Joi.string().trim().max(100).required()
}).unknown(false)
const cacheDir = path.resolve(__dirname, '../../.cache/street-lists')
const pending = new Map()
let upstreamQueue = Promise.resolve()
let requestWindow = { start: Date.now(), count: 0 }
function failure(message, statusCode = 503) { return Object.assign(new Error(message), { statusCode }) }
function normalized(value) {
    return String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd')
        .toLowerCase().replace(/^(province of |city of |municipality of |thanh pho |thi xa |phuong |huyen |quan |xa |tinh )/, '')
        .replace(/[^\p{L}\p{N}]/gu, '')
}
function nameFilter(name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return JSON.stringify(`(^| )${escaped}$`)
}
function namedRelations(set, name) {
    return `rel(area.${set})["boundary"="administrative"][~"^(name|name:en|name:vi|official_name|short_name)$"~${nameFilter(name)},i];out tags;`
}
function uniqueBoundary(elements, name) {
    const ids = new Map()
    for (const element of elements) {
        if (element.type !== 'relation' || !Number.isSafeInteger(element.id) || element.id <= 0) continue
        if (['name', 'name:en', 'name:vi', 'official_name', 'short_name'].some(tag => normalized(element.tags?.[tag]) === normalized(name))) ids.set(element.id, element)
    }
    // Never silently choose between identically named places.
    return ids.size === 1 ? [...ids.values()][0] : null
}
async function resolveBoundary(prefix, region, set, name) {
    // Indexed exact names are much cheaper than worldwide regular-expression scans.
    const direct = await queryOverpass(prefix + region + `rel(area.${set})["boundary"="administrative"]["name"=${JSON.stringify(name)}];out tags;`)
    const match = uniqueBoundary(direct, name)
    if (match || direct.length > 1) return match
    return uniqueBoundary(await queryOverpass(prefix + region + namedRelations(set, name)), name)
}
async function queryOverpass(query) {
    const task = upstreamQueue.then(async () => {
        if (Date.now() - requestWindow.start >= 3600000) requestWindow = { start: Date.now(), count: 0 }
        if (++requestWindow.count > 90) throw failure('Street downloads are busy. Please try again later.', 429)
        const endpoint = new URL(process.env.STREET_OVERPASS_URL || 'https://overpass.private.coffee/api/interpreter')
        if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) throw failure('Street list provider is not configured correctly.')
        const response = await fetch(endpoint, {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Runstore-checkout-street-lists/1.0' },
            body: new URLSearchParams({ data: query }).toString(), signal: AbortSignal.timeout(30000), redirect: 'error'
        })
        if (!response.ok) throw failure('Street list download is unavailable. Please try again later.')
        if (Number(response.headers.get('content-length')) > 10 * 1024 * 1024) throw failure('This street list is too large to download safely.')
        const text = await response.text()
        if (text.length > 10 * 1024 * 1024) throw failure('This street list is too large to download safely.')
        const data = JSON.parse(text)
        // Overpass can return HTTP 200 with an incomplete result and a runtime remark.
        if (data.remark || !Array.isArray(data.elements)) throw failure('Street list download did not finish. Please retry later.')
        return data.elements
    })
    upstreamQueue = task.catch(() => {})
    return task
}
async function downloadList(location) {
    const prefix = '[out:json][timeout:25][maxsize:33554432];'
    const countryArea = `area["ISO3166-1"=${JSON.stringify(location.country_code)}]["admin_level"="2"]->.country;`
    let regionSet = 'country'
    let region = countryArea
    if (location.province_state) {
        const province = await resolveBoundary(prefix, countryArea, 'country', location.province_state)
        if (!province) return { available: true, streets: [], reason: 'boundary_unavailable' }
        region += `rel(${province.id});map_to_area->.province;`
        regionSet = 'province'
    }
    const city = await resolveBoundary(prefix, region, regionSet, location.city)
    if (!city) return { available: true, streets: [], reason: 'boundary_unavailable' }
    const roads = await queryOverpass(prefix + `rel(${city.id});map_to_area->.city;way(area.city)["highway"]["name"];out tags;`)
    const names = new Map()
    for (const road of roads) {
        const name = road.tags?.['name:vi'] && location.country_code === 'VN' ? road.tags['name:vi'] : road.tags?.name
        if (road.type !== 'way' || !road.tags?.highway || typeof name !== 'string' || !name.trim() || name.length > 200) continue
        names.set(normalized(name), name.trim())
    }
    return { available: true, streets: [...names.values()].sort((a, b) => a.localeCompare(b, location.country_code === 'VN' ? 'vi' : 'en')),
        boundary_id: city.id, reason: names.size ? null : 'no_named_streets' }
}
async function getStreetList(input) {
    const { error, value } = schema.validate(input)
    if (error) throw failure('Choose a valid country and city.', 400)
    if (value.country_code === 'UK') value.country_code = 'GB'
    const key = createHash('sha256').update(JSON.stringify(value)).digest('hex')
    const file = path.join(cacheDir, `${key}.json`)
    try {
        const saved = JSON.parse(await fs.readFile(file, 'utf8'))
        const ttl = saved.streets?.length ? 30 * 86400000 : 6 * 3600000
        if (saved.location && JSON.stringify(saved.location) === JSON.stringify(value) && Array.isArray(saved.streets) && Date.now() - saved.saved_at < ttl) return { ...saved, cached: true }
    } catch { /* Missing/corrupt caches are re-downloaded, not trusted. */ }
    if (pending.has(key)) return pending.get(key)
    if (pending.size >= 4) throw failure('Street downloads are busy. Please try again shortly.', 429)
    const task = (async () => {
        try {
            const result = { ...await downloadList(value), location: value, source: 'OpenStreetMap', saved_at: Date.now(), cached: false }
            await fs.mkdir(cacheDir, { recursive: true })
            const temporary = path.join(cacheDir, `${key}.${randomUUID()}.tmp`)
            await fs.writeFile(temporary, JSON.stringify(result), { encoding: 'utf8', flag: 'wx' })
            await fs.rename(temporary, file)
            return result
        } catch (error) {
            if (error.statusCode) throw error
            throw failure('Street list download is temporarily unavailable. You can still enter your street manually.')
        }
    })()
    pending.set(key, task)
    try { return await task } finally { pending.delete(key) }
}
module.exports = { getStreetList }
