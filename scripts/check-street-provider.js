// Read-only diagnostic: no credentials, no address/contact data, no file writes.
const endpoint = process.argv[2] || 'https://overpass.private.coffee/api/interpreter'
const query = '[out:json][timeout:25][maxsize:33554432];area["ISO3166-1"="US"]["admin_level"="2"]->.country;rel(area.country)["boundary"="administrative"]["name"="Massachusetts"];out tags;'
async function main() {
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'Runstore-street-list-diagnostic/1.0' }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(30000) })
    const data = await response.json()
    console.log(JSON.stringify({ status: response.status, remark: String(data.remark || '').slice(0, 500), count: data.elements?.length, names: data.elements?.map(item => item.tags?.name).slice(0, 5) }))
}
main().catch(() => { console.error('Could not reach or parse the street data provider.'); process.exitCode = 1 })
