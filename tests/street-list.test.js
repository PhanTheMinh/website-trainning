const mockFiles = new Map()
jest.mock('node:fs/promises', () => ({
    readFile: jest.fn(async file => { if (!mockFiles.has(file)) throw new Error('Missing'); return mockFiles.get(file) }),
    mkdir: jest.fn(async () => {}),
    writeFile: jest.fn(async (file, contents) => { mockFiles.set(file, contents) }),
    rename: jest.fn(async (from, to) => { mockFiles.set(to, mockFiles.get(from)); mockFiles.delete(from) })
}))
const { getStreetList } = require('../src/services/street-list.service')
let originalFetch
function response(elements, extra = {}) {
    return { ok: true, headers: { get: () => null }, text: async () => JSON.stringify({ elements, ...extra }) }
}
function fixtures(province, city) {
    global.fetch.mockResolvedValueOnce(response([{ type: 'relation', id: 100, tags: { name: province } }]))
        .mockResolvedValueOnce(response([{ type: 'relation', id: 200, tags: { name: city } }]))
        .mockResolvedValueOnce(response([{ type: 'way', id: 1, tags: { name: 'Main Street', highway: 'residential' } },
            { type: 'way', id: 2, tags: { name: 'Main Street', highway: 'primary' } },
            { type: 'way', id: 3, tags: { name: 'Other Street', highway: 'residential' } }]))
}
beforeEach(() => { mockFiles.clear(); originalFetch = global.fetch; global.fetch = jest.fn() })
afterEach(() => { global.fetch = originalFetch })
test.each([
    ['VN', 'Hải Dương', 'Kinh Môn'], ['VN', 'Hải Dương', 'Chí Linh'],
    ['US', 'Massachusetts', 'Boston'], ['FR', 'Île-de-France', 'Paris']
])('downloads a boundary-specific list for %s / %s / %s without a search term', async (country_code, province_state, city) => {
    fixtures(province_state, city)
    const result = await getStreetList({ country_code, province_state, city })
    expect(result.streets).toEqual(['Main Street', 'Other Street'])
    const queries = global.fetch.mock.calls.map(([, options]) => new URLSearchParams(options.body).get('data'))
    expect(queries[0]).toContain(`"ISO3166-1"="${country_code}"`)
    expect(queries[1]).toContain('rel(100);map_to_area->.province')
    expect(queries[2]).toContain('rel(200);map_to_area->.city')
    expect(queries[2]).toContain('way(area.city)')
})
test('saves the downloaded list and reuses it without the provider', async () => {
    fixtures('Massachusetts', 'Boston')
    const input = { country_code: 'US', province_state: 'Massachusetts', city: 'Boston' }
    await getStreetList(input)
    global.fetch.mockRejectedValue(new Error('Offline'))
    expect((await getStreetList(input)).cached).toBe(true)
    expect(global.fetch).toHaveBeenCalledTimes(3)
})
test('deduplicates concurrent downloads for the same location', async () => {
    fixtures('Massachusetts', 'Boston')
    const input = { country_code: 'US', province_state: 'Massachusetts', city: 'Boston' }
    const [first, second] = await Promise.all([getStreetList(input), getStreetList(input)])
    expect(first.streets).toEqual(second.streets)
    expect(global.fetch).toHaveBeenCalledTimes(3)
})
test('does not pick an ambiguous boundary or substitute another city', async () => {
    global.fetch.mockResolvedValueOnce(response([{ type: 'relation', id: 100, tags: { name: 'Massachusetts' } }]))
        .mockResolvedValueOnce(response([{ type: 'relation', id: 200, tags: { name: 'Boston' } }, { type: 'relation', id: 201, tags: { name: 'Boston' } }]))
    const result = await getStreetList({ country_code: 'US', province_state: 'Massachusetts', city: 'Boston' })
    expect(result.reason).toBe('boundary_unavailable')
    expect(result.streets).toEqual([])
    expect(global.fetch).toHaveBeenCalledTimes(2)
})
test('does not save partially downloaded data or leak provider failures', async () => {
    global.fetch.mockResolvedValue(response([], { remark: 'runtime error: timeout' }))
    await expect(getStreetList({ country_code: 'US', province_state: 'Massachusetts', city: 'Boston' })).rejects.toMatchObject({ statusCode: 503 })
    expect(mockFiles.size).toBe(0)
})
test('validates location input before any download', async () => {
    await expect(getStreetList({ country_code: 'XX', city: 'Boston' })).rejects.toMatchObject({ statusCode: 400 })
    expect(global.fetch).not.toHaveBeenCalled()
})
