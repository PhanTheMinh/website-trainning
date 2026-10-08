# Frontend redesign — staged delivery

## Approved direction

- US English interface; seller-entered names/descriptions remain unchanged.
- Light and dark themes, forest green and lime, restrained spacing and surfaces.
- Retain Vue 3/Vite and all existing API, auth, ownership, and payment contracts.
- Currency stays VND. Formatting now uses en-US and an explicit VND code; no exchange-rate conversion.
- No fabricated reviews, discounts, verification, sales badges, or nonfunctional commerce buttons.

## Checkpoint 1: foundation and representative screens

Implemented:

- Semantic tokens in `frontend/src/styles/tokens.css`.
- Self-hosted Be Vietnam Pro via a pinned Fontsource dependency (Latin and Vietnamese for existing product names).
- Light/dark header toggle. Initial system preference, storage fallback, cross-tab sync, system-change listener until explicit selection, early boot script to avoid theme flash.
- Shared header and footer, mobile search outside the navigation menu.
- Shared buttons, icons, page headers, empty states, product skeletons, confirmation dialog, pagination, product card/grid.
- Catalog/category product listing with sidebar filters on desktop, collapsible filters on mobile, image containment, price-range validation and explicit Apply action.
- English category display labels and sorting/pagination copy. Category values and URLs unchanged.
- SellerLayout and a flatter seller sidebar. Applied to payment list and payment create/edit first.
- Payment list and forms in both themes; semantic table/mobile rows, consistent actions, native modal delete confirmation. Error loading an edit record cannot accidentally show an editable default form.

This is the planned visual-review checkpoint, not completion of all 24 views.

## Site-wide theme completion

Removed the temporary light-only boundary. All legacy global styles and view-local surfaces, text, borders, forms, tables, notices and overlays now use the shared semantic palette. Home, categories, detail, shop, cart/checkout, auth/profile, product management and shipping screens no longer pin their main content to white in dark mode. Product photography retains its original colors.

Native controls, placeholders, disabled states, file selectors and autofill follow the selected theme. Solid promotional surfaces use dedicated foreground/background pairs. Regression tests scan all Vue styles and legacy CSS for fixed surface/text colors and check the core palette against a 4.5:1 text contrast threshold in both modes.

Full layout modernization remains separate from this completed CSS migration. Existing navigation/auth guards and business logic remain intact. Authenticated seller content still needs visual review in an authorized signed-in session; guest-route checks do not verify those private states.

## Remaining order

1. Review the catalog and Payment methods visual direction.
2. Home, category overview, public shop, product detail.
3. Cart and checkout, including COD, shipping and autosave states.
4. Auth/profile/avatar and focus handling.
5. Seller overview, product list/create/edit/trash, shop settings, shipping/countries/rates.
6. Finish English copy, responsive/state/accessibility review, remove legacy CSS after reference checks, consider route-level code splitting.

## Verification

- Commands: `npm --prefix frontend run lint`, `npm --prefix frontend test`, `npm --prefix frontend run build`.
- Added theme/early-boot tests; product-card rendering/category identity tests; mocked payment list/create/edit/delete/status regressions; catalog filter tests.
- Browser checks on the running local app: light/dark catalog, mobile/tablet layouts, theme persistence after refresh, filters, sort, pagination, search/empty results.
- Browser session is signed out. Actual authenticated seller CRUD and seller visual states must still be checked in the developer's signed-in session; tests do not bypass production auth or mutate live data.
- Site-wide theme pass: 75 tests across 13 files, lint and production build pass. Browser-verified home, category overview (light/dark and 390px mobile), product detail and auth modal; additional public/guest routes checked for leftover bright CSS surfaces. Private populated views are covered by source/style checks, not authenticated visual verification.
- Build currently reports the existing large JavaScript chunk warning; route splitting is still pending.

## Manual review

- `/products`: try the sun/moon button, refresh, change search/sort, apply/clear price limits, resize to mobile.
- `/me/manage/payment-methods`: in your existing seller session, inspect the list, Add method and Edit screens. Use an authorized test shop if exercising write operations.
- Check both themes, keyboard focus, Escape/cancel in the deletion dialog, and validation before expanding the design to remaining screens.
