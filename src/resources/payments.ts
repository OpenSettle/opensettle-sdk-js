import { unwrap, type HttpClient } from "../http.js";
import type { ResourceCallOpts } from "./options.js";
import type {
  Payment,
  PaymentStatus,
  InitiateRefundRequest,
  InitiateRefundResponse,
  CursorPage,
} from "./types.js";

/**
 * Sanctions-screening verdict. Surfaces on every Payment row;
 * filter parameter for `payments.list()` so ops can scan the
 * flagged queue.
 */
export type ScreeningVerdict =
  | "not_screened"
  | "screened_clean"
  | "screened_flagged"
  | "screen_error";

export type ListPaymentsQuery = {
  cursor?: string;
  limit?: number;
  customerId?: string;
  subscriptionId?: string;
  status?: PaymentStatus;
  /**
   * Filter by sanctions-screening verdict. Backed server-side by the
   * partial index `payments_screening_verdict_idx` so a
   * `screened_flagged` query stays cheap at scale. Today's default
   * with the NoopScreeningProvider is every payment landing as
   * `not_screened`; once screening verdicts are populated this is the
   * primary ops triage surface.
   */
  screeningVerdict?: ScreeningVerdict;
  /**
   * Inclusive lower bound on `createdAt`. Any ISO-8601 string (e.g.
   * `"2026-04-01"` or `"2026-04-01T00:00:00Z"`). Pairs with `to` to
   * window a reporting period.
   */
  from?: string;
  /** Inclusive upper bound on `createdAt`. ISO-8601; must be >= `from`. */
  to?: string;
  /**
   * Side-load related resources. `"customer"` adds a `customer` field
   * (the full customer object, or `null`) to every payment row in the
   * response. The only supported value today.
   */
  expand?: "customer";
};

export class PaymentsResource {
  constructor(private readonly http: HttpClient) {}

  async list(query?: ListPaymentsQuery): Promise<CursorPage<Payment>> {
    return this.http.request("/payments", { query });
  }

  async retrieve(paymentId: string): Promise<Payment> {
    const resp = await this.http.request<unknown>(
      `/payments/${encodeURIComponent(paymentId)}`,
    );
    return unwrap<Payment>(resp, "payment");
  }

  /**
   * Initiate a refund. Returns the unsigned-tx payload — the merchant's
   * dashboard or wallet client signs and broadcasts it; OpenSettle never
   * holds funds.
   *
   * Auth: refunds are admin-only and step-up gated. API keys with the
   * default `restricted` permission scope receive `ForbiddenError`; only
   * keys with `full` permissions reach the AAL gate, where session-mode
   * callers receive `StepUpRequiredError`.
   *
   * Returns a multi-key envelope `{payment, unsignedTx}` — both halves
   * are needed by the caller, so the wrapper is preserved (not
   * single-key unwrapped).
   */
  refund(
    paymentId: string,
    input: InitiateRefundRequest = {},
    opts?: ResourceCallOpts,
  ): Promise<InitiateRefundResponse> {
    return this.http.request(
      `/payments/${encodeURIComponent(paymentId)}/refund`,
      {
        method: "POST",
        body: input,
        idempotencyKey: opts?.idempotencyKey ?? true,
      },
    );
  }

  /**
   * Tell OpenSettle the merchant has broadcast the signed refund tx.
   * The chain-reader observer picks it up and flips status to refunded.
   *
   * Auth: same admin/step-up gate as {@link PaymentsResource.refund}.
   */
  async refundBroadcast(
    paymentId: string,
    body: { refundTxHash: string },
    opts?: ResourceCallOpts,
  ): Promise<Payment> {
    const resp = await this.http.request<unknown>(
      `/payments/${encodeURIComponent(paymentId)}/refund/broadcast`,
      {
        method: "POST",
        body,
        idempotencyKey: opts?.idempotencyKey ?? true,
      },
    );
    return unwrap<Payment>(resp, "payment");
  }
}
