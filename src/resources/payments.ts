import type { HttpClient } from "../http.js";
import type {
  Payment,
  InitiateRefundRequest,
  InitiateRefundResponse,
  CursorPage,
} from "./types.js";

export type ListPaymentsQuery = {
  cursor?: string;
  limit?: number;
  customerId?: string;
  status?: string;
};

export class PaymentsResource {
  constructor(private readonly http: HttpClient) {}

  list(query?: ListPaymentsQuery): Promise<CursorPage<Payment>> {
    return this.http.request("/payments", { query });
  }

  retrieve(paymentId: string): Promise<Payment> {
    return this.http.request(`/payments/${encodeURIComponent(paymentId)}`);
  }

  /**
   * Initiate a refund. Returns the unsigned-tx payload — the merchant's
   * dashboard or wallet client signs and broadcasts it; OpenSettle never
   * holds funds. Step-up auth (AAL=2) is required on this route.
   */
  refund(
    paymentId: string,
    input: InitiateRefundRequest = {},
  ): Promise<InitiateRefundResponse> {
    return this.http.request(
      `/payments/${encodeURIComponent(paymentId)}/refund`,
      { method: "POST", body: input, idempotencyKey: true },
    );
  }

  /**
   * Tell OpenSettle the merchant has broadcast the signed refund tx.
   * The chain-reader observer picks it up and flips status to refunded.
   */
  refundBroadcast(
    paymentId: string,
    body: { txHash: string },
  ): Promise<Payment> {
    return this.http.request(
      `/payments/${encodeURIComponent(paymentId)}/refund/broadcast`,
      { method: "POST", body, idempotencyKey: true },
    );
  }
}
