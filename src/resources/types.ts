/**
 * Re-exports of the canonical resource types from `@opensettle/shared`.
 * Resource modules import from here so the SDK has one entry point for
 * every type — and so consumers can reach them via `import type { … }
 * from "@opensettle/sdk"`.
 *
 * Anything that's a Zod schema in shared we export only the inferred TS
 * type — the SDK shouldn't drag the runtime Zod imports along.
 */

export type {
  Customer,
  CreateCustomerRequest,
  UpdateCustomerRequest,
  CustomerStatus,
} from "@opensettle/shared/schemas/customer";

export type {
  Product,
  CreateProductRequest,
  UpdateProductRequest,
  Price,
  CreatePriceRequest,
  PriceInterval,
} from "@opensettle/shared/schemas/product";

export type {
  Invoice,
  InvoiceStatus,
  CreateInvoiceRequest,
  LineItem,
} from "@opensettle/shared/schemas/invoice";

export type {
  Payment,
  PaymentStatus,
  InitiateRefundRequest,
  InitiateRefundResponse,
} from "@opensettle/shared/schemas/payment";

export type {
  Subscription,
  SubscriptionStatus,
  AutopayMode,
  CreateSubscriptionRequest,
} from "@opensettle/shared/schemas/subscription";

export type {
  CheckoutMode,
  CheckoutStatus,
  CreateCheckoutRequest,
} from "@opensettle/shared/schemas/checkout";

import type {
  CheckoutMode as _CheckoutMode,
  CheckoutStatus as _CheckoutStatus,
} from "@opensettle/shared/schemas/checkout";
import type { ChainId as _ChainId, TokenSymbol as _TokenSymbol } from "@opensettle/shared/schemas/wallet";

/**
 * Checkout session row as the API returns it. Mirrors the DB columns from
 * `apps/api/src/db/schema/checkouts.ts` minus internal-only fields. Kept
 * local to the SDK because the shared schemas package only exposes the
 * Zod request shape; the API response is a Drizzle `$inferSelect` which
 * we don't want to drag a DB driver through.
 */
export type Checkout = {
  id: string;
  workspaceId: string;
  mode: _CheckoutMode;
  status: _CheckoutStatus;
  customerId: string;
  invoiceId: string | null;
  priceId: string | null;
  amountMinor: number;
  currency: string;
  chain: _ChainId;
  token: _TokenSymbol;
  description: string | null;
  successUrl: string;
  cancelUrl: string | null;
  expiresAt: string;
  completedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type {
  WebhookEndpoint,
  WebhookEndpointStatus,
  CreateWebhookEndpointRequest,
  CreateWebhookEndpointResponse,
} from "@opensettle/shared/schemas/webhook";

export type { ChainId, TokenSymbol } from "@opensettle/shared/schemas/wallet";

export type { PaginationQuery } from "@opensettle/shared/schemas/pagination";

/**
 * Local mirror of the cursor-page envelope shared API responses use. Lives
 * here because shared exposes a `pageEnvelope()` factory function rather
 * than a static type.
 */
export type CursorPage<T> = {
  data: T[];
  nextCursor: string | null;
  hasMore?: boolean;
};
