# Changelog

All notable changes to `@opensettle/sdk` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] — 2026-05-12

### Fixed

- **`src/version.ts`** — stale doc comment pointed at a non-existent
  `test/version.test.ts`; the pin actually lives in `test/client.test.ts`
  as the "SDK_VERSION matches package.json" test. Source-only cleanup —
  no behavior change.

## [0.2.0] — 2026-05-10

### Added

- **`products.delete(productId)`** — hard-deletes a product. The server
  rejects with 409 if any subscription still references it; clean up the
  dependent subscriptions first.
- **`products.deletePrice(priceId)`** — hard-deletes a price (same 409
  rule as `products.delete`).

### Removed

- **`products.archivePrice(priceId)`** — replaced by
  `products.deletePrice(priceId)`. The previous implementation `PATCH`ed
  `{ active: false }`; the canonical lifecycle is now hard-delete with
  the foreign-key check enforced server-side. Migrate by replacing
  `archivePrice` calls with `deletePrice`.

## [0.1.3] — 2026-05-08

### Fixed

- **`subscriptions.cancel(subId, body)`** — the `mode` enum was `"now" |
  "at_period_end"`, which the API rejected (it expects `"immediately" |
  "at_period_end"`). Calls to cancel-now were failing schema validation
  before reaching the cancel logic. The body is now optional (server
  defaults to `at_period_end`) and accepts an optional `reason` field
  that's recorded on the audit log.
- **`subscriptions.changePlan(subId, body)`** — the `prorate?: boolean`
  flag was silently ignored by the server, which only reads
  `prorationMode: "immediately" | "at_period_end"` (default `"at_period_end"`).
  Renamed the field to match. **Behavior change:** previous callers
  passing `{ prorate: true }` were unknowingly running with proration
  deferred to period end; pass `{ prorationMode: "immediately" }` to
  preserve the *intended* behavior.

### Removed

- **`subscriptions.forceRenew(subId)`** — this called an admin-only
  route (`requireRole("admin")` server-side, intentionally omitted from
  the public OpenAPI spec). Regular API keys (developer role) get a
  403, so the method was never callable from a real merchant
  integration. Removed.

### Changed

- `package.json` `description` no longer mentions Solana and Tron —
  those chains are not yet available to merchants on the platform
  (the wallet picker is EVM-only). README updated to match.
- `SDK_VERSION` constant aligned with `package.json` (was stuck at
  `0.1.0`).

## [0.1.1] — 2026-05-06

### Changed

- **Repository URL corrected.** `0.1.0` shipped with `repository.url`
  pointing to `OpenSettle/OpenSettle.io` (the private monorepo — the link
  404'd for npm visitors). The SDK now lives in its own public repo at
  [github.com/OpenSettle/opensettle-sdk-js](https://github.com/OpenSettle/opensettle-sdk-js).
  `repository.url`, `bugs`, and the README all updated to point there.
  No code changes between `0.1.0` and `0.1.1`.

### Fixed

- **`LICENSE` file aligned with `package.json`.** `package.json` declared
  MIT; the `LICENSE` file in `0.1.0` was a proprietary "all rights
  reserved" notice. Both now agree on the standard MIT terms — the
  package was always intended to ship MIT, this resolves the legal
  ambiguity.

## [0.1.0] — 2026-05-02

Initial release. Server-side Node SDK covering the OpenSettle merchant API.

### Added

- `OpenSettle` client with workspace-scoped API key auth
  (`Authorization: Bearer sk_{live|test}_…`)
- Typed error hierarchy mapping every stable API error code to a class
  (`InvalidRequestError`, `AuthenticationError`, `RateLimitError`,
  `SettlementError`, `StepUpRequiredError`, `APIError`, `NetworkError`,
  …)
- Resources: `customers`, `products` (+ prices), `invoices`, `checkouts`,
  `subscriptions`, `payments`, `webhookEndpoints`
- `verifyWebhook(...)` — constant-time HMAC-SHA256 verifier matching the
  API's `x-opensettle-signature` format. Configurable tolerance window.
- Bounded exponential-backoff retries on 5xx, 429, and network errors;
  4xx user errors never retry.
- Auto-generated `Idempotency-Key` headers on money-adjacent writes;
  caller-supplied keys honoured.
- `testMode` circuit breaker — refuses `sk_live_…` when true and
  `sk_test_…` when false.
- 50 unit tests covering config validation, request shape, error
  mapping, retry behaviour, query encoding, idempotency injection,
  resource wiring, and webhook verification (valid, tampered body,
  stale timestamp, malformed header, wrong secret, forward-compat
  signature keys).

### Compatibility

- Node 20+ (built-in `fetch`, `node:crypto`)
- ESM-only (`type: "module"`)
- TypeScript types ship in the package — no `@types/…` companion needed.
