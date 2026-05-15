# Changelog

All notable changes to `@opensettle/sdk` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **`products.deletePrice` return type corrected to `Promise<void>`.**
  The API returns `204 No Content` on hard-delete (same as
  `products.delete`), but the TypeScript signature claimed
  `Promise<Price>` and the implementation tried to `unwrap` a non-
  existent envelope — callers destructuring `(await deletePrice(id)).id`
  would have hit `undefined` at runtime with no compile-time signal.
  Method signature is now `deletePrice(priceId): Promise<void>`,
  matching the existing `products.delete()` shape. Runtime behaviour is
  unchanged; this is a type-correctness fix.

### Changed

- **`webhookEndpoints.update()` accepts `description: string | null`.**
  The server schema (`UpdateWebhookEndpointRequest`) permits `null` to
  clear an existing description; the SDK type previously only allowed
  `string | undefined`, leaving callers no in-SDK way to wipe the
  field. No wire change — the value is forwarded as-is.

## [0.5.0] — 2026-05-14

### Fixed (critical — published `0.4.0` shipped with these wire bugs)

- **`subscriptions.cancel`, `pause`, `resume`** — previously did not
  attach an `Idempotency-Key`. The API requires the header on every
  state-mutating subscription route, so these three methods returned
  `400 invalid_request` from the server in `0.4.0` and earlier. The SDK
  now auto-generates a key (and accepts a caller-supplied one via the
  new `ResourceCallOpts.idempotencyKey`).
- **`webhookEndpoints.test()`** — the body shape (`{eventType: string}`)
  and return type (`{ok, status, latencyMs}`) were fabricated; the API
  ignores any body and returns `{eventId: string}`. Signature is now
  `test(endpointId, opts?)` returning `WebhookTestResult` (`{eventId}`).
  Callers passing the old `{eventType}` body need to drop it; the
  `eventId` field replaces the synthetic `ok/status/latencyMs` fields.
- **`webhookEndpoints.rotateSecret()`** — accepted a
  `{graceSeconds?: number}` body that the API silently dropped. The
  parameter is removed; the rotation grace is server-side configured.
- **Published `.d.ts` files leaked `@opensettle/shared` imports.** The
  workspace's source-only schema package is `devDependencies`-only, so
  TypeScript consumers of `0.4.0` saw `Cannot find module
  '@opensettle/shared/schemas/...'` errors for every public type. SDK
  type definitions are now inlined — the published declarations have
  zero references to internal workspace packages.
- **`OpenSettleError` exposes `metadata`.** The API's error envelope
  carries a free-form `metadata` field (currently used by
  `restricted_jurisdiction` to ship `{ code, name, reason }`); the
  v0.4.0 SDK silently dropped it.
- **`verifyWebhook` accepts `Buffer` and `Uint8Array` raw bodies.**
  Previously string-only, which forced callers to round-trip through
  UTF-8 — multi-byte payloads could re-encode and break HMAC
  verification. The HMAC is now computed over raw bytes and the JSON
  is parsed from the same bytes after verification succeeds.
- **`verifyWebhook` rejects empty `secret`.** Throws the new
  `WebhookSecretError` upfront so a misconfigured env var doesn't
  silently let an attacker forge any payload via an empty-key HMAC.

### Added

- **`RestrictedJurisdictionError`** (subclass of `ForbiddenError`) for
  the `restricted_jurisdiction` API code. Generic `forbidden` handlers
  still catch it via `instanceof ForbiddenError`. The envelope's
  `metadata` (`{ code, name, reason }`) is exposed on the error.
- **`metadata: Record<string, unknown> | null`** field on every
  `OpenSettleError` subclass.
- **`WebhookSecretError`** thrown by `verifyWebhook` when `secret` is
  empty.
- **`ResourceCallOpts`** — every state-mutating resource method now
  accepts an optional trailing `{ idempotencyKey?: string }` so callers
  can tie the request's `Idempotency-Key` to a domain object they
  already own. Available on
  `customers.create`, `products.create / createPrice`,
  `invoices.create / send / remind`, `checkouts.create`,
  `subscriptions.create / pause / resume / cancel / changePlan`,
  `payments.refund / refundBroadcast`,
  `webhookEndpoints.create / rotateSecret / test`.
- **`customers.delete()` and `webhookEndpoints.delete()`** as the
  canonical method names; `del` is preserved as a deprecated alias that
  delegates to `delete`. Return type aligned to what the API actually
  returns (`{ ok: boolean }`, HTTP 200) instead of `void`.
- **Compatibility note:** package now sets `"sideEffects": false` for
  bundler tree-shaking, and the build target is pinned to `node20`
  (matches `engines.node >= 20`). A `prepublishOnly` hook runs
  typecheck + tests + build before publish.

### Changed

- **`package.json` description and keywords** walk back the Solana and
  Tron mentions per the never-executed `0.1.3` commitment ("those
  chains are not yet available to merchants on the platform — the
  wallet picker is EVM-only"). The `ChainId` *type* still includes the
  full enum so future expansion doesn't require an SDK release; only
  the marketing/copy surfaces are EVM-only.
- **`InvoicesQuery.status` and `PaymentsQuery.status`** narrowed from
  `string` to `InvoiceStatus` / `PaymentStatus` so typos fail at
  compile time.
- **`payments.refund` / `refundBroadcast` JSDoc** now correctly
  describes the auth gate: restricted-permission keys receive
  `ForbiddenError`; only full-permission keys reach the AAL gate where
  session callers see `StepUpRequiredError`.

### Migration from 0.4.0

- `webhookEndpoints.test(id, { eventType })` → `webhookEndpoints.test(id)`.
  The return shape changes from `{ok, status, latencyMs}` to `{eventId}`.
- `webhookEndpoints.rotateSecret(id, { graceSeconds })` →
  `webhookEndpoints.rotateSecret(id)`.
- `customers.del`/`webhookEndpoints.del` callers expecting `void` now
  receive `{ ok: true }`. The `del` aliases continue to work; switching
  to `customers.delete`/`webhookEndpoints.delete` is recommended.

## [0.4.0] — 2026-05-12

### Added

- **Pagination iterator** — `paginate(os.customers.list.bind(os.customers))`
  yields every item across all pages via an `AsyncGenerator`. Pass a
  second argument with filters; the cursor is threaded through every
  call automatically.
- **Polling helper** — `waitFor((id) => os.payments.retrieve(id),
  "pay_…", (p) => p.status === "confirmed", { timeoutMs, intervalMs })`.
  Throws `WaitTimeoutError` on timeout with `.last` set to the
  last-observed resource.

## [0.3.0] — 2026-05-12

**Breaking** — discovered via live smoke against `api.opensettle.io`:
prior versions did not unwrap the API's singleton response envelopes
and had two incorrect type/field shapes.

### Fixed

- **Singleton response envelope unwrapping.** The API returns
  `{customer: {…}}`, `{product: {…}}`, etc. for non-list responses.
  Resource methods now return the unwrapped resource so
  `await os.customers.create(…)` resolves to the `Customer` (its `.id`
  works), not `{customer: Customer}`. Multi-key envelopes
  (`refund` returns `{payment, unsignedTx}`; webhook create/rotate
  returns `{endpoint, signingSecret}`) pass through unchanged.
- **`payments.refundBroadcast` body field** changed from `txHash` to
  `refundTxHash` to match `RecordRefundBroadcastRequest` in
  `@opensettle/shared`. The prior shape was rejected by the API.
- **`webhookEndpoints.rotateSecret` return type** changed from
  `{secret, rotationGraceUntil}` to `CreateWebhookEndpointResponse`
  (`{endpoint, signingSecret}`) to match what the API actually returns.

### Migration

Search-and-replace fixups for 0.2.x callers:

- `result.customer.id` → `result.id` (and similar for product,
  invoice, payment, subscription, checkout, endpoint)
- `payments.refundBroadcast(id, { txHash })` →
  `payments.refundBroadcast(id, { refundTxHash })`
- `rotateSecret(id)` callers using `result.secret` → use
  `result.signingSecret`; the result now also includes `result.endpoint`

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
