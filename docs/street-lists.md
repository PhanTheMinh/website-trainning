# Street lists by Country → Province → City/Ward

> No longer active in checkout: the user chose the simplified address form. See `simplified-checkout-address.md`. Lookup code is retained for compatibility but checkout no longer calls it.

## Current checkout behaviour

- Selecting a city automatically requests `POST /api/checkout/street-list` with country code, province name and city name. No street search text or contact details are sent.
- The backend resolves the province within the selected country, then the city's administrative boundary within that province, and downloads named mapped roads inside that boundary.
- The arrow opens the downloaded list without requiring typing. Typing filters it locally, with accent-insensitive matching. Manual entry remains possible.
- Changing country, province or city clears the old street. Obsolete client responses are ignored; no street from the previous city is retained.
- The same code serves every supported country/location. No special Kinh Môn street list, mock choices or guessed road names are shipped.

## Download and persistence

- Source: OpenStreetMap via Overpass. This path does **not** use a Geoapify key. The earlier autocomplete endpoint is retained for compatibility but is no longer used by the checkout Street input.
- Default endpoint: `https://overpass.private.coffee/api/interpreter`. Override `STREET_OVERPASS_URL` on the backend for a contracted or self-hosted provider.
- Lists download on demand, not the entire world in advance. Stored in `.cache/street-lists/` as hashed-location JSON files, including provenance, boundary ID and timestamp. This directory is ignored by Git; use persistent storage on deployment.
- Successful lists are reused for 30 days. Confirmed missing boundaries/empty results are cached for 6 hours. Upstream failures and partial/timeout responses are not stored as successful lists.
- Same-location concurrent calls share one download. Upstream queries are sequential, with a limit of 90 queries/hour/process. The authenticated endpoint permits 10 calls/user/minute/process. Use shared rate limits, persistent shared caching and a provider suitable for actual production traffic when deploying multiple instances.
- Cache files are an optimization, not order data. Orders still save their independent address snapshots.

## Coverage limitations

Worldwide support means the same lookup mechanism works across countries; it is not a guarantee that every street/city is mapped. Missing administrative boundaries, naming changes, duplicate place names or unmapped roads result in an explicit empty/unavailable state, not a substituted nearby place.

Existing Vietnamese City/Ward choices include current ward/commune names and legacy province labels. Their boundaries can differ from historical districts. A list follows the **selected mapped boundary**, not an assumed whole historical district. Inconsistent legacy geography may need a separately reviewed alias/ID mapping; do not guess it.

No preloaded worldwide street database has been downloaded. The first lookup depends on provider availability. The UI shows loading, missing-data or retry messages and always permits manual entry.

## Source references

- https://wiki.openstreetmap.org/wiki/Overpass_API
- https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL
- https://www.openstreetmap.org/copyright

Keep OpenStreetMap attribution visible and review ODbL requirements if distributing a derived street database. Configure a production-appropriate provider; public servers offer no guaranteed availability.
