# Checkout street suggestions

> Superseded in checkout by city-wide lists: see `street-lists.md`. The endpoint described below is retained for compatibility but is no longer used by the Street input.

## Enable

1. Create a project at https://myprojects.geoapify.com/ and obtain your own API key.
2. Set `GEOAPIFY_API_KEY=your_key` in the backend `.env` (not frontend, not a `VITE_` variable). Do not commit the key.
3. Restart the backend. Sign in and open checkout; select country/province/city and type at least 3 street characters.
4. Pick a street from the suggestions. House number, apartment and ward remain separate manual fields.

No key has been created or purchased by this implementation. Check the provider's current quota, billing, attribution and privacy terms before production use. Configure provider-side IP restrictions and spending/quota limits for your deployment.

## Behaviour and safety

- `POST /api/checkout/street-suggestions`, authenticated; maximum 30 requests per user/minute per backend process. For multi-instance deployments use a shared rate-limit store and an account-wide quota at the provider.
- UI waits 450 ms after typing; cancels obsolete calls and ignores late replies after a location change/unmount.
- Backend requests only street results, restricts country and rejects results whose city/state do not match the selected values. Differences in provider/local administrative naming can yield no suggestions; manual entry remains available.
- Only partial street text, country, province and city are sent to Geoapify. Name, phone, email, house number and apartment are not included as separate fields. Users should enter only a street name in this field.
- POST keeps the search out of URL access logs; response is `no-store`. Do not enable body or upstream URL logging for this endpoint.
- No key: API responds with `available: false`. Timeout/provider failure: generic 503 without exposing the secret. Checkout and order creation do not depend on suggestion availability.
- Selecting a suggestion changes **only street**, leaving country/province/city/ZIP and quantities unchanged. The existing checkout autosave persists it as plain text.
- Existing address geography files are not replaced. No migrations or new address tables are required.
- Suggestions are not proof of deliverability and are not an exhaustive list of streets.

Reference: https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/
