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
  /**
   * Side-load related resources. `"customer"` adds a `customer` field
   * (the full customer object, or `null`) to every subscription row in
   * the response. The only supported value today.
   */
  expand?: "customer";
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
   * Change a subscription's price (plan upgrade/downgrade).
   *
   * Only `prorationMode: "at_period_end"` (the default) is implemented: the
   * new price simply takes effect at the next billing cycle, with no
   * mid-cycle credit or charge. `prorationMode: "immediately"` is **not
   * implemented** — the API rejects it with `400 invalid_request` (there is
   * no proration billing yet) rather than silently ignoring it, so you can't
   * be misled into thinking a mid-cycle charge fired. The `immediately`
   * value is kept on the type for forward-compatibility for when proration
   * billing ships.
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
