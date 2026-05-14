import { unwrap, type HttpClient } from "../http.js";
import type { ResourceCallOpts } from "./options.js";
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

  async list(query?: ListSubscriptionsQuery): Promise<CursorPage<Subscription>> {
    return this.http.request("/subscriptions", { query });
  }

  async retrieve(subId: string): Promise<Subscription> {
    const resp = await this.http.request<unknown>(
      `/subscriptions/${encodeURIComponent(subId)}`,
    );
    return unwrap<Subscription>(resp, "subscription");
  }

  async create(
    input: CreateSubscriptionRequest,
    opts?: ResourceCallOpts,
  ): Promise<Subscription> {
    const resp = await this.http.request<unknown>("/subscriptions", {
      method: "POST",
      body: input,
      idempotencyKey: opts?.idempotencyKey ?? true,
    });
    return unwrap<Subscription>(resp, "subscription");
  }

  async pause(subId: string, opts?: ResourceCallOpts): Promise<Subscription> {
    const resp = await this.http.request<unknown>(
      `/subscriptions/${encodeURIComponent(subId)}/pause`,
      { method: "POST", idempotencyKey: opts?.idempotencyKey ?? true },
    );
    return unwrap<Subscription>(resp, "subscription");
  }

  async resume(subId: string, opts?: ResourceCallOpts): Promise<Subscription> {
    const resp = await this.http.request<unknown>(
      `/subscriptions/${encodeURIComponent(subId)}/resume`,
      { method: "POST", idempotencyKey: opts?.idempotencyKey ?? true },
    );
    return unwrap<Subscription>(resp, "subscription");
  }

  /**
   * `mode: "immediately"` cancels right now; `mode: "at_period_end"` flags
   * the subscription to auto-cancel at the next billing boundary. Default
   * is `"at_period_end"`. Optional `reason` is recorded on the audit log.
   */
  async cancel(
    subId: string,
    body?: { mode?: "immediately" | "at_period_end"; reason?: string },
    opts?: ResourceCallOpts,
  ): Promise<Subscription> {
    const resp = await this.http.request<unknown>(
      `/subscriptions/${encodeURIComponent(subId)}/cancel`,
      {
        method: "POST",
        body: body ?? {},
        idempotencyKey: opts?.idempotencyKey ?? true,
      },
    );
    return unwrap<Subscription>(resp, "subscription");
  }

  /**
   * `prorationMode: "immediately"` prorates and bills now; `"at_period_end"`
   * defers the swap. Default is `"at_period_end"`.
   */
  async changePlan(
    subId: string,
    body: { priceId: string; prorationMode?: "immediately" | "at_period_end" },
    opts?: ResourceCallOpts,
  ): Promise<Subscription> {
    const resp = await this.http.request<unknown>(
      `/subscriptions/${encodeURIComponent(subId)}/change_plan`,
      {
        method: "POST",
        body,
        idempotencyKey: opts?.idempotencyKey ?? true,
      },
    );
    return unwrap<Subscription>(resp, "subscription");
  }
}
