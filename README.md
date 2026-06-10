# @opensettle/sdk

Official Node SDK for the [OpenSettle](https://opensettle.io) API. Multi-chain
stablecoin billing: USDC on Base, Ethereum, Polygon, Arbitrum, and Solana;
USDT on Ethereum, Polygon, Arbitrum, Solana, and Tron. (Hosted checkout is
EVM-only today — see [below](#hosted-checkout-evm-only-today).)

[![npm](https://img.shields.io/npm/v/@opensettle/sdk.svg)](https://www.npmjs.com/package/@opensettle/sdk)
![types](https://img.shields.io/badge/types-included-blue)
![node](https://img.shields.io/node/v/@opensettle/sdk)

> **Status: 0.5.x.** Pre-1.0 — minor versions may still introduce small
> breaking changes (see [CHANGELOG](./CHANGELOG.md)). We'll bump to 1.0.0
> once the surface has been stable in real merchant integrations for a
> quarter. Source at
> [github.com/OpenSettle/opensettle-sdk-js](https://github.com/OpenSettle/opensettle-sdk-js);
> for urgent issues email [security@opensettle.io](mailto:security@opensettle.io).

Ships both ESM and CJS — works in `import` and `require()` consumers. Type
declarations are bundled inline so consumers don't need to install any
companion `@types/…` package.

## Install

```bash
npm install @opensettle/sdk
# or
pnpm add @opensettle/sdk
# or
yarn add @opensettle/sdk
```

Requires Node 20+ (uses built-in `fetch` and `node:crypto`).

## Quickstart

```ts
import { OpenSettle } from "@opensettle/sdk";

const os = new OpenSettle({
  apiKey: process.env.OPENSETTLE_KEY!,        // sk_live_… or sk_test_…
  workspaceId: process.env.OPENSETTLE_WORKSPACE!,
});

// Create a customer
const customer = await os.customers.create({
  email: "ada@example.com",
  name: "Ada Lovelace",
});

// Bill them with a one-shot invoice paid in USDC on Base.
// Total is derived from `lineItems[].unitAmountMinor * quantity` —
// there is no top-level `amountMinor`. `currency` defaults to "USD".
const invoice = await os.invoices.create({
  customerId: customer.id,
  chain: "base",
  token: "USDC",
  lineItems: [
    { description: "Pro plan", quantity: 1, unitAmountMinor: 19_900 }, // $199.00 — minor units (cents)
  ],
  dueInDays: 14,                               // optional, default 14
});

await os.invoices.send(invoice.id);            // emails the customer the link
```

## Hosted checkout: EVM-only today

The API accepts `chain: "solana"` or `chain: "tron"` on a checkout and the
chain reader will detect inbound SPL / TRC-20 deposits to verified wallets,
but the customer-facing **hosted checkout page is currently EVM-only**:
Base, Ethereum, Polygon, and Arbitrum. If you create a checkout with
`chain: "solana"` or `chain: "tron"`, the hosted page will not render a
payable flow for the customer today. Use one of the EVM chains for hosted
checkouts until non-EVM hosted-checkout support ships.

## Configuration

```ts
new OpenSettle({
  apiKey: "sk_live_…",                          // required
  workspaceId: "ws_01HG…",                      // required
  baseUrl: "https://api.opensettle.io",         // optional override
  testMode: process.env.NODE_ENV !== "production", // refuses sk_live_ when true
  timeoutMs: 30_000,                            // per-request timeout
  maxNetworkRetries: 3,                         // retries on 5xx + 429 + network errors
  fetch: customFetch,                           // override the global fetch (rare)
});
```

The SDK refuses to send live traffic on a test key (and vice versa) when
`testMode` is set explicitly — useful as a CI circuit breaker.

## Errors

Every non-2xx response throws a typed subclass of `OpenSettleError`. Catchers
can branch on either the class or the stable `code` property.

```ts
import {
  OpenSettleError,
  RateLimitError,
  SettlementError,
  StepUpRequiredError,
} from "@opensettle/sdk";

try {
  await os.payments.refund("pay_1", { amountMinor: 100 });
} catch (err) {
  if (err instanceof RateLimitError) {
    await sleep((err.retryAfter ?? 1) * 1000);
    return retry();
  }
  if (err instanceof StepUpRequiredError) {
    return promptUserToReauthenticate();        // refunds need AAL=2
  }
  if (err instanceof SettlementError && err.code === "insufficient_confirmations") {
    return tryAgainInAFewBlocks();
  }
  if (err instanceof OpenSettleError) {
    log.error({ code: err.code, requestId: err.requestId }, err.message);
  }
  throw err;
}
```

| Class | HTTP | Error code(s) |
|---|---|---|
| `InvalidRequestError` | 400 | `invalid_request` |
| `InvalidStateTransitionError` | 422 | `invalid_state_transition` |
| `AuthenticationError` | 401 | `unauthorized` |
| `ForbiddenError` | 403 | `forbidden` |
| `NotFoundError` | 404 | `not_found` |
| `ConflictError` | 409 | `conflict` |
| `RateLimitError` | 429 | `rate_limited` (carries `retryAfter`) |
| `RestrictedJurisdictionError` | 403 | `restricted_jurisdiction` (`metadata: { code, name, reason }`) |
| `KybRequiredError` | 403 | `kyb_required` (`metadata.kybStatus`) |
| `AttestationRequiredError` | 412 | `attestation_required` (`metadata: { category, requiredAge }`) |
| `SettlementError` | 422 | `chain_reverted`, `insufficient_confirmations`, `signing_required` |
| `StepUpRequiredError` | 401 | `aal_required` |
| `APIError` | 5xx | `internal_error` (and unknown future codes) |
| `NetworkError` | — | `network_error` (request never landed) |

Every error carries `code`, `status`, `message`, `requestId`, and optionally
`param` for field-level errors. `requestId` is the value to quote in support.

## Idempotency

Every state-mutating call (create, send, remind, refund, pause, resume,
cancel, change-plan, rotate, test) auto-attaches a random `Idempotency-Key`
header. Pass an explicit key tied to a domain object you already own to
make retries from your own systems collide on the same key — which is what
keeps the operation safe:

```ts
await os.checkouts.create(
  {
    mode: "payment",
    customerId: "cus_1",
    invoiceId: "inv_1",
    successUrl: "https://example.com/done",
  },
  { idempotencyKey: `checkout-${orderId}` },
);

await os.subscriptions.cancel(
  "sub_…",
  { mode: "at_period_end" },
  { idempotencyKey: `cancel-${orderId}` },
);
```

For low-level access (custom routes, header overrides) the underlying
client is exposed as `os.http.request(...)`.

## Webhooks

Verify signed deliveries from `webhook_endpoints` with the `verifyWebhook`
helper — it checks the HMAC-SHA256 in constant time and rejects stale
timestamps:

```ts
import { verifyWebhook, WebhookVerificationError } from "@opensettle/sdk";

app.post("/webhook", async (req, res) => {
  try {
    const { data } = verifyWebhook<{ id: string; type: string }>({
      rawBody: req.rawBody,                     // exact bytes received
      signatureHeader: req.header("x-opensettle-signature"),
      secret: process.env.WEBHOOK_SECRET!,
    });
    if (data.type === "payment.confirmed") {
      // ship the goods, mark the order paid
    }
    res.sendStatus(200);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      // err.reason: "missing_header" | "malformed_header"
      //           | "stale_timestamp" | "signature_mismatch"
      //           | "invalid_body"
      return res.status(400).end(err.reason);
    }
    throw err;
  }
});
```

The signature format is `t=<unix>,v1=<hex_hmac_sha256>` over `${t}.${rawBody}`.
Default tolerance is 5 minutes; pass `tolerance: <seconds>` to override (or
`0` to disable, only in test code).

> **Capture the raw body.** Frameworks that JSON-parse before your handler
> sees it (Express body-parser default, etc.) destroy the original bytes —
> you'll get spurious `signature_mismatch` errors. Configure raw-body access
> on the webhook route only.

### Event payloads

`verifyWebhook<T>` returns `data` typed as your `T` — the SDK does not ship
event-payload types, so you annotate the shape you care about. Every body is
`{ id, type, livemode, created_at, data }`. `data` is the event-specific
payload (there is **no** `data.object` wrapper and **no** `api_version`). See
the full event catalog and sample bodies in the
[webhook contracts](https://opensettle.io/docs/webhooks) reference.

Two shapes worth calling out:

- **`payment.confirmed`** (and the other `payment.*` ids-only events) carries
  **ids only** — `{ paymentId, checkoutId }`. Fetch the full row with
  `os.payments.retrieve(paymentId)` when you need amounts or on-chain fields.
- **`subscription.renewed`** ships an **additive superset**:
  `{ subscription, invoice, subscriptionId, nextBillingDate, metadata }`.
  `subscription` and `invoice` are the embedded resources; `subscriptionId` and
  `nextBillingDate` are kept as top-level convenience fields so older handlers
  that read `data.subscriptionId` keep working.

```ts
type RenewedEvent = {
  id: string;
  type: "subscription.renewed";
  created_at: string;
  data: {
    subscription: { id: string; status: string };
    invoice: { id: string; status: string };
    subscriptionId: string;       // convenience mirror of subscription.id
    nextBillingDate: string;      // ISO-8601
    metadata: Record<string, unknown> | null;
  };
};

const { data } = verifyWebhook<RenewedEvent>({ rawBody, signatureHeader, secret });
if (data.type === "subscription.renewed") {
  extendAccess(data.data.subscriptionId, data.data.nextBillingDate);
}
```

## Recipes

Runnable, compile-tested examples — hosted checkout, subscriptions, webhook
verification, pagination, and refunds — across all four SDKs in the
[OpenSettle Cookbook](https://github.com/OpenSettle/opensettle-cookbook).

## Resources

- `os.customers` — `list`, `retrieve`, `create`, `update`, `delete` (alias `del`)
- `os.products` — `list`, `retrieve`, `create`, `update`, `delete`, `listPrices`, `createPrice`, `deletePrice`
- `os.invoices` — `list`, `retrieve`, `create`, `send`, `remind`, `void`
- `os.checkouts` — `create`, `retrieve`
- `os.paymentLinks` — `create`, `list`, `deactivate` (alias `del`)
- `os.subscriptions` — `list`, `retrieve`, `create`, `pause`, `resume`, `cancel`, `changePlan`
- `os.payments` — `list`, `retrieve`, `refund`, `refundBroadcast`
- `os.webhookEndpoints` — `list`, `retrieve`, `create`, `update`, `delete` (alias `del`), `rotateSecret`, `test`

Each method returns the typed resource. Refer to the [API reference](https://opensettle.io/docs/api)
for the full field set per resource.

## Pagination

`list` endpoints return a cursor-paged envelope (`{ data, nextCursor, hasMore }`).
The `paginate` helper threads the cursor through every call and yields every
item across every page as an `AsyncGenerator` — no manual pagination loop
needed:

```ts
import { paginate } from "@opensettle/sdk";

for await (const customer of paginate(os.customers.list.bind(os.customers))) {
  console.log(customer.id, customer.email);
}

// Pass filters as the second argument; the cursor is threaded automatically.
for await (const inv of paginate(
  os.invoices.list.bind(os.invoices),
  { status: "open" },
)) {
  console.log(inv.id);
}
```

## Polling helpers

Webhooks are the right tool for production, but in scripts, CI, and tests
it's useful to block until a resource transitions. `waitFor` polls a
resource's `retrieve` at a fixed interval until your predicate is satisfied
— or rejects with `WaitTimeoutError` (its `.last` is the last-observed
resource for debugging).

```ts
import { waitFor, WaitTimeoutError } from "@opensettle/sdk";

const checkout = await os.checkouts.create({ /* … */ });

try {
  const done = await waitFor(
    (id) => os.checkouts.retrieve(id),
    checkout.id,
    (c) => c.status === "succeeded" || c.status === "failed",
    { timeoutMs: 120_000, intervalMs: 1_500 },  // defaults: 120s / 2s
  );
  console.log(done.status);
} catch (err) {
  if (err instanceof WaitTimeoutError) {
    // err.last is the last-observed resource
  }
  throw err;
}
```

## Test mode

Use a `sk_test_…` key against the same hostname — there is no separate test
host. Test-mode wallets, customers, and payments live in their own scope and
don't bleed into live data.

```ts
const os = new OpenSettle({
  apiKey: process.env.OPENSETTLE_TEST_KEY!,
  workspaceId: process.env.OPENSETTLE_WORKSPACE!,
  testMode: true,                               // assert this is a test key
});
```

## Non-custodial settlement

OpenSettle never holds customer or merchant funds — payments transfer
directly from the customer's wallet to your settlement wallet on-chain.
Our platform fee is accrued separately and billed once a month. The SDK
reflects that: `payments.refund()` returns an unsigned-tx envelope your
wallet signs and broadcasts; we never have keys that can move funds.

See the [security architecture docs](https://opensettle.io/docs/security)
for the full posture.

## License

MIT. See [LICENSE](./LICENSE).
