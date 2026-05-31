/**
 * Type declarations for every resource the SDK exposes.
 *
 * These are mirrored byte-for-byte from `@opensettle/shared/schemas/*`
 * (the canonical Zod schemas the API validates against) — but written
 * here as plain TypeScript so the published `.d.ts` is self-contained.
 * The SDK has no runtime or type dependency on the workspace shared
 * package; consumers don't need to install anything beyond
 * `@opensettle/sdk` itself.
 *
 * **Sync rule:** when a schema in `packages/shared/src/schemas/` changes
 * shape, update the matching declaration here and add a CHANGELOG entry.
 * The two are intentionally decoupled so a wire-shape addition can land
 * without a forced SDK release, and so the SDK can hold a stable surface
 * across schema reshuffles.
 */

// --- chain + token (mirrors `wallet.ts`)
export type ChainId =
  | "base"
  | "ethereum"
  | "polygon"
  | "arbitrum"
  | "tron"
  | "solana";

export type TokenSymbol = "USDC" | "USDT";

// --- pagination (mirrors `pagination.ts`)
export type PaginationQuery = {
  cursor?: string;
  limit?: number;
};

/**
 * Local mirror of the cursor-page envelope shared API responses use.
 * `hasMore` is best-effort — prefer `nextCursor === null` as the stop
 * condition.
 */
export type CursorPage<T> = {
  data: T[];
  nextCursor: string | null;
  hasMore?: boolean;
};

// --- customer (mirrors `customer.ts`)
export type CustomerStatus = "active" | "at_risk" | "churned";

export type Customer = {
  id: string;
  workspaceId: string;
  email: string;
  name: string;
  wallet: string | null;
  country: string | null;
  status: CustomerStatus;
  activeSubscriptions: number;
  lifetimeValue: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  deletedAt: string | null;
};

export type CreateCustomerRequest = {
  email: string;
  name: string;
  wallet?: string;
  country?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateCustomerRequest = {
  name?: string;
  wallet?: string | null;
  country?: string | null;
  metadata?: Record<string, unknown> | null;
};

// --- product (mirrors `product.ts`)
export type PriceInterval = "one_time" | "week" | "month" | "year";

export type Product = {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  active: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type Price = {
  id: string;
  workspaceId: string;
  productId: string;
  amount: number;
  currency: string;
  interval: PriceInterval;
  active: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type CreateProductRequest = {
  name: string;
  description?: string;
  metadata?: Record<string, unknown>;
};

export type UpdateProductRequest = {
  name?: string;
  description?: string | null;
  active?: boolean;
  metadata?: Record<string, unknown> | null;
};

export type CreatePriceRequest = {
  amount: number;
  currency?: string;
  interval: PriceInterval;
  metadata?: Record<string, unknown>;
};

// --- invoice (mirrors `invoice.ts`)
export type InvoiceStatus = "draft" | "open" | "paid" | "past_due" | "void";

export type LineItem = {
  description: string;
  quantity: number;
  unitAmountMinor: number;
};

export type Invoice = {
  id: string;
  workspaceId: string;
  number: string;
  customerId: string;
  subscriptionId: string | null;
  amountMinor: number;
  currency: string;
  chain: ChainId;
  token: TokenSymbol;
  status: InvoiceStatus;
  lineItems: LineItem[];
  memo: string | null;
  paymentId: string | null;
  hostedUrl: string;
  issuedAt: string | null;
  dueAt: string;
  paidAt: string | null;
  voidedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type CreateInvoiceRequest = {
  customerId: string;
  chain: ChainId;
  token: TokenSymbol;
  currency?: string;
  lineItems: LineItem[];
  memo?: string;
  /** Days from now until due. Default 14. */
  dueInDays?: number;
  subscriptionId?: string;
  metadata?: Record<string, unknown>;
};

// --- payment (mirrors `payment.ts`)
export type PaymentStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "refunded"
  | "reorged";

export type Payment = {
  id: string;
  workspaceId: string;
  customerId: string | null;
  subscriptionId: string | null;
  invoiceId: string | null;
  walletId: string | null;
  amountMinor: number;
  feeMinor: number;
  netMinor: number;
  currency: string;
  token: TokenSymbol;
  chain: ChainId;
  status: PaymentStatus;
  failureReason: string | null;
  description: string | null;
  txHash: string | null;
  blockNumber: number | null;
  confirmations: number;
  refundTxHash: string | null;
  refundAmountMinor: number | null;
  refundBroadcastAt: string | null;
  refundedAt: string | null;
  refundReason: string | null;
  /**
   * Sanctions-screening verdict (server populated). Today's default
   * with the NoopScreeningProvider is `not_screened`. Once a real
   * provider is wired, individual rows transition to
   * `screened_clean` / `screened_flagged` / `screen_error`. The
   * `screened_flagged` rows are the ops triage queue.
   */
  screeningVerdict:
    | "not_screened"
    | "screened_clean"
    | "screened_flagged"
    | "screen_error";
  /** Screening provider name of record, or null. Today this is the in-house no-op provider, so it is null on every payment row. */
  screeningProvider: string | null;
  /** ISO-8601 timestamp; null when `screeningVerdict === "not_screened"`. */
  screeningScreenedAt: string | null;
  createdAt: string;
  confirmedAt: string | null;
};

export type InitiateRefundRequest = {
  amountMinor?: number;
  reason?: string;
  /**
   * Address to refund to. Required when the payer's address wasn't
   * captured at payment time. For EVM chains this must be a 0x-prefixed
   * 20-byte hex address.
   */
  recipientAddress?: string;
};

/**
 * Concrete EVM tx envelope: `to` is the ERC-20 contract, `data` is the
 * ABI-encoded `transfer(recipient, amount)` calldata. Only present for
 * EVM chains the registry knows how to assemble.
 */
export type UnsignedEvmTx = {
  to: string;
  data: string;
  value: "0";
  chainId: number;
  tokenAddress: string;
  recipient: string;
  amountBaseUnits: string;
};

export type InitiateRefundResponse = {
  payment: Payment;
  /**
   * Unsigned tx envelope the merchant's wallet should sign + broadcast.
   * Shape varies by chain; shipped as a neutral object the dashboard can
   * pick up.
   */
  unsignedTx: {
    chain: ChainId;
    token: TokenSymbol;
    /** For EVM chains this is the ERC-20 contract; for non-EVM, the recipient. */
    to: string;
    amountMinor: number;
    memo?: string;
    instructions: string;
    /** Present only for EVM chains we have a registry entry for. */
    evm?: UnsignedEvmTx;
  };
};

// --- subscription (mirrors `subscription.ts`)
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled";

export type AutopayMode = "allowance" | "smart-wallet" | "manual";

export type Subscription = {
  id: string;
  workspaceId: string;
  customerId: string;
  productId: string;
  priceId: string;
  amountMinor: number;
  currency: string;
  chain: ChainId;
  token: TokenSymbol;
  status: SubscriptionStatus;
  autopay: AutopayMode;
  allowanceTx: string | null;
  allowanceRemaining: number | null;
  trialEndsAt: string | null;
  startedAt: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
  canceledAt: string | null;
  cancelReason: string | null;
  pausedAt: string | null;
  mrrMinor: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type CreateSubscriptionRequest = {
  customerId: string;
  priceId: string;
  chain: ChainId;
  token: TokenSymbol;
  autopay?: AutopayMode;
  trialDays?: number;
  metadata?: Record<string, unknown>;
};

// --- checkout (mirrors `checkout.ts`)
export type CheckoutMode = "payment" | "subscription";

export type CheckoutStatus =
  | "open"
  | "pending"
  | "succeeded"
  | "failed"
  | "expired";

/**
 * Create-checkout request. Mode drives which sibling field is required:
 *   - mode=payment      → `invoiceId` required
 *   - mode=subscription → `priceId` required
 *
 * Customer: supply either `customerId` (existing) or `customerEmail`
 * (find-or-create).
 */
export type CreateCheckoutRequest = {
  mode: CheckoutMode;
  customerId?: string;
  customerEmail?: string;
  customerName?: string;
  invoiceId?: string;
  priceId?: string;
  successUrl: string;
  cancelUrl?: string;
  /** Chain + token override. Defaults come from invoice/price at the service layer. */
  chain?: ChainId;
  token?: TokenSymbol;
  /** Minutes the session stays `open` before auto-expiring. Default 30. */
  expiresInMinutes?: number;
  metadata?: Record<string, unknown>;
};

/**
 * Checkout session row as the API returns it. Mirrors the DB columns from
 * `apps/api/src/db/schema/checkouts.ts` minus internal-only fields.
 */
export type Checkout = {
  id: string;
  workspaceId: string;
  mode: CheckoutMode;
  status: CheckoutStatus;
  customerId: string;
  invoiceId: string | null;
  priceId: string | null;
  amountMinor: number;
  currency: string;
  chain: ChainId;
  token: TokenSymbol;
  description: string | null;
  successUrl: string;
  cancelUrl: string | null;
  expiresAt: string;
  completedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  /**
   * Absolute URL for redirecting the buyer to the OpenSettle-hosted
   * checkout page — use it directly (no concatenation needed). Uses an
   * unguessable hosted-token, not the timestamp-prefixed `id`, so siblings
   * can't be brute-force enumerated.
   */
  hostedUrl: string;
};

// --- webhook endpoint (mirrors `webhook.ts`)
export type WebhookEndpointStatus = "enabled" | "disabled";

export type WebhookEndpoint = {
  id: string;
  workspaceId: string;
  url: string;
  description: string | null;
  events: string[];
  status: WebhookEndpointStatus;
  successRate: number;
  rotationGraceUntil: string | null;
  createdAt: string;
};

export type CreateWebhookEndpointRequest = {
  url: string;
  description?: string;
  /** `["*"]` = wildcard. */
  events?: string[];
};

export type CreateWebhookEndpointResponse = {
  endpoint: WebhookEndpoint;
  /** Plaintext signing secret. Only returned once. */
  signingSecret: string;
};
