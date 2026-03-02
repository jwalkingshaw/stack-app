# Market Scope UX Pass (Products + Assets)

_Date: February 28, 2026_

## Scope Reviewed

- Header scope controls
- `/assets` and `/assets/upload`
- `/products`, product detail, variant detail
- Settings pages for Markets, Channels, Destinations

## Current UX State

## Header (global context)

- Scope controls render on assets/products routes and are hidden on `/assets/upload`.
- Controls are treated as active context selectors (market, language, channel, destination).
- Context auto-selects first available options, so users are always in a concrete scope.

## Assets

- `/assets` has strong quick filters (product, new content, updated, tags, sort) and folder navigation.
- Drag-and-drop upload entry from content area is present.
- Set-sharing dialog already supports optional market/channel/locale constraints.
- Header scope does not directly filter asset list by market/channel/locale/destination.

## Upload

- Upload flow captures folder + upload profile + metadata + product links.
- No explicit authoring scope panel (market/channel/language/destination) on upload.

## Products

- Product list and detail read header scope and send scope query params.
- Product/variant detail compute `isScopeReady` and block data loading until context exists.
- UI does not show explicit scope chips/badges in detail header.

## Settings alignment

- Markets: robust market + language/default locale management.
- Channels: basic create/enable/disable.
- Destinations: create with optional channel + market, active toggle, fallback mode support.
- No explicit settings-level visualization of valid scope combinations.

## Key Gaps vs Blueprint

## Critical

1. Working context vs authoring scope is not explicit.
2. Upload has no authoring-scope input despite being the core asset creation point.
3. Product APIs do not consistently consume market/channel/locale/destination params that UI sends.

## High

1. Product detail/variant detail relies on context readiness but does not show the selected scope tuple in-page.
2. Assets list header context can feel non-functional because it doesn’t materially change results.
3. Destination setup allows loose combinations without UX guidance on preferred constraints.

## Medium

1. Settings pages are separate and don’t show a live “scope matrix” (valid Market x Channel x Locale x Destination combinations).
2. No destination selector in set-scope constraints (currently market/channel/locale only).

## UI Requirements to Implement Blueprint

## R1: Shared Authoring Scope Component

Build a reusable `AuthoringScopePicker` with:
- Mode: `Global` / `Scoped`
- Selectors: Market, Channel, Language, Destination
- Actions: `Use current context`, `Clear`
- Validation hints for invalid combinations

## R2: Upload Surface

On `/assets/upload`:
- Add "Authoring Scope" card next to Upload Destination.
- Apply scope to all queued rows by default.
- Allow row-level override in metadata table.
- Show scope chips per row.

## R3: Product Create + Detail

- Add optional "Initial Authoring Scope" in add-product modal.
- Add scope chip row in product and variant detail headers.
- Add field badges for `Global / Scoped / Missing in this scope`.

## R4: Header semantics

- Keep header as viewing context only.
- Add inline label/help: "Viewing context".
- Never imply writes happen from header selection.

## R5: Settings alignment upgrades

- Markets: keep as locale source-of-truth.
- Channels: keep distribution source-of-truth.
- Destinations: add stronger create/edit guidance:
  - `Global destination` or constrained by channel/market
  - clear compatibility hints with current channels/markets
- Add "Scope Matrix" preview section in Settings.

## R6: Share scope parity

- Extend set-scope constraints to include destination when needed.
- Keep market/channel/locale behavior unchanged.

## Immediate Build Order

1. R1 + R2 (upload authoring scope)  
2. R3 (product create/detail scope UI)  
3. R4 (header semantics copy + helper)  
4. R5 (settings matrix + destination UX polish)  
5. R6 (destination in set constraints)
