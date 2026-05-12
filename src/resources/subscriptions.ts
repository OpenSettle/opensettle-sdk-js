import type { HttpClient } from "../http.js";
import type {
  Subscription,
  CreateSubscriptionRequest,
  CursorPage,
} from "./types.js";

export type ListSubscriptionsQuery = {
  cursor?: string;
  limit?: number;
  customerId?: string;
  status?: string;
};

export class SubscriptionsResource {
  constructor(private readonly http: HttpClient) {}

  list(query?: ListSubscriptionsQuery): Promise<CursorPage<Subscription>> {
    return this.http.request("/subscriptions", { query });
  }

  retrieve(subId: string): Promise<Subscription> {
    return this.http.request(`/subscriptions/${encodeURIComponent(subId)}`);
  }

  create(input: CreateSubscriptionRequest): Promise<Subscription> {
    return this.http.request("/subscriptions", {
      method: "POST",
      body: input,
      idempotencyKey: true,
    });
  }

  pause(subId: string): Promise<Subscription> {
    return this.http.request(
      `/subscriptions/${encodeURIComponent(subId)}/pause`,
      { method: "POST" },
    );
  }

  resume(subId: string): Promise<Subscription> {
    return this.http.request(
      `/subscriptions/${encodeURIComponent(subId)}/resume`,
      { method: "POST" },
    );
  }

  /**
   * `mode: "immediately"` cancels right now; `mode: "at_period_end"` flags
   * the subscription to auto-cancel at the next billing boundary. Default
   * is `"at_period_end"`. Optional `reason` is recorded on the audit log.
   */
  cancel(
    subId: string,
    body?: { mode?: "immediately" | "at_period_end"; reason?: string },
  ): Promise<Subscription> {
    return this.http.request(
      `/subscriptions/${encodeURIComponent(subId)}/cancel`,
      { method: "POST", body: body ?? {} },
    );
  }

  /**
   * `prorationMode: "immediately"` prorates and bills now; `"at_period_end"`
   * defers the swap. Default is `"at_period_end"`.
   */
  changePlan(
    subId: string,
    body: { priceId: string; prorationMode?: "immediately" | "at_period_end" },
  ): Promise<Subscription> {
    return this.http.request(
      `/subscriptions/${encodeURIComponent(subId)}/change_plan`,
      { method: "POST", body, idempotencyKey: true },
    );
  }
}
