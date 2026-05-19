import { unwrap, type HttpClient } from "../http.js";
import type { ResourceCallOpts } from "./options.js";
import type { Checkout, CreateCheckoutRequest } from "./types.js";

export class CheckoutsResource {
  constructor(private readonly http: HttpClient) {}

  async create(
    input: CreateCheckoutRequest,
    opts?: ResourceCallOpts,
  ): Promise<Checkout> {
    const resp = await this.http.request<unknown>("/checkouts", {
      method: "POST",
      body: input,
      idempotencyKey: opts?.idempotencyKey ?? true,
    });
    return unwrap<Checkout>(resp, "checkout");
  }

  async retrieve(id: string): Promise<Checkout> {
    const resp = await this.http.request<unknown>(
      `/checkouts/${encodeURIComponent(id)}`,
    );
    return unwrap<Checkout>(resp, "checkout");
  }
}
