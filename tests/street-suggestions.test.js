const { suggestStreets } = require('../src/services/street-suggestions.service')
const input = { text: 'Main', country_code: 'US', province_state: 'Massachusetts', city: 'Springfield' }
let oldKey, oldFetch
beforeEach(() => {
    oldKey = process.env.GEOAPIFY_API_KEY
    oldFetch = global.fetch
    process.env.GEOAPIFY_API_KEY = 'test-only-key'
    global.fetch = jest.fn()
})
afterEach(() => {
    if (oldKey === undefined) delete process.env.GEOAPIFY_API_KEY
    else process.env.GEOAPIFY_API_KEY = oldKey
    global.fetch = oldFetch
})
test('missing key allows manual entry without a provider request', async () => {
    delete process.env.GEOAPIFY_API_KEY
    await expect(suggestStreets(input)).resolves.toEqual({ available: false, suggestions: [] })
    expect(global.fetch).not.toHaveBeenCalled()
})
test('rejects invalid searches and unexpected personal fields before calling the provider', async () => {
    for (const invalid of [{ ...input, text: 'a' }, { ...input, country_code: 'XX' }, { ...input, city: '' }, { ...input, email: 'private@example.com' }]) {
        await expect(suggestStreets(invalid)).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(global.fetch).not.toHaveBeenCalled()
})
test('uses a fixed street endpoint, country filter and only matching deduplicated streets', async () => {
    const match = { country_code: 'us', state: 'Massachusetts', city: 'Springfield', street: 'Main Street' }
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ results: [match, match,
        { ...match, city: 'Boston' }, { ...match, state: 'Illinois' }, { ...match, country_code: 'gb' }, { ...match, street: null }] }) })
    await expect(suggestStreets(input)).resolves.toEqual({ available: true, suggestions: [{ street: 'Main Street' }] })
    const [url, options] = global.fetch.mock.calls[0]
    expect(url.origin).toBe('https://api.geoapify.com')
    expect(url.searchParams.get('type')).toBe('street')
    expect(url.searchParams.get('filter')).toBe('countrycode:us')
    expect(url.searchParams.get('text')).toBe('Main, Springfield, Massachusetts')
    expect(options.redirect).toBe('error')
    expect(options.signal).toBeDefined()
})
test('matches Vietnamese names with or without accents', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ results: [{ country_code: 'vn', city: 'Ha Noi', state: 'Ha Noi', street: 'Đường Láng' }] }) })
    await expect(suggestStreets({ text: 'Lang', country_code: 'VN', city: 'Hà Nội', province_state: 'Hà Nội' }))
        .resolves.toMatchObject({ suggestions: [{ street: 'Đường Láng' }] })
})
test('normalizes UK and never exposes provider failures or the API key', async () => {
    global.fetch.mockRejectedValue(new Error('URL includes test-only-key'))
    await expect(suggestStreets({ ...input, country_code: 'UK' })).rejects.toMatchObject({ statusCode: 503 })
    try { await suggestStreets(input) } catch (error) { expect(error.message).not.toContain('test-only-key') }
    expect(global.fetch.mock.calls[0][0].searchParams.get('filter')).toBe('countrycode:gb')
})
test('treats upstream HTTP and malformed responses as unavailable', async () => {
    global.fetch.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    await expect(suggestStreets(input)).rejects.toMatchObject({ statusCode: 503 })
    await expect(suggestStreets(input)).rejects.toMatchObject({ statusCode: 503 })
})
