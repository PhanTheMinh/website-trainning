# Payment methods and checkout review

## Fixed

- Recover from PAYMENT_METHOD_UNAVAILABLE by refreshing available methods, clearing the rejected selection and resaving pending edits. Preserve address, quantities, shipping selections and local backup. Never adopt a newer checkout version automatically; stop on concurrent changes.
- Multi-shop COD uses a common label and exposes each shop's display name, description and instructions separately. Single-shop display behavior and existing selection IDs remain compatible.
- Payment list/form ignore superseded requests, clear private state on account changes and invalidate pending loads on unmount. Old mutation responses cannot navigate or display notices in another account.
- Added mocked regression tests for recovery, refresh failure, conflicts, request order, logout, multi-shop instructions and owner-scoped access.

## Checkout follow-up findings (not implemented in this change)

1. **Delivery address incomplete:** the UI, address normalizer and API schema contain region/city/postcode but no street/house/unit address. Add address_line1 (required at order confirmation) and optional address_line2 end-to-end. Existing drafts need backward-compatible empty defaults.
2. **Draft only:** checkout routes expose create/read/update/list drafts, not order confirmation. A complete purchase flow needs server-side final validation, an idempotent order transaction, inventory handling, per-shop snapshots and order confirmation. Partial draft fields intentionally remain allowed until then.
3. **Unavailable product recovery:** backend revalidates products and stock, but the checkout only offers quantity editing, retry and reload; no line removal. A stopped product cannot be resolved within the current draft. Add explicit removal, minimum-one-line/empty-draft handling and clear per-line availability errors.

## Verification boundaries

- Frontend tests and backend isolated unit tests use mocks and do not mutate live data.
- Backend unit ownership assertions verify owner-scoped queries, not HTTP/session integration.
- Database integration tests and authenticated browser validation must still run against an authorized test shop/database before release.
- No auth bypass, schema migration or order/payment collection was added.
