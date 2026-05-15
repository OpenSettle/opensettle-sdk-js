import { unwrap, type HttpClient } from "../http.js";
import type { ResourceCallOpts } from "./options.js";
import type { Checkout, CreateCheckoutRequest } from "./types.js";

export class CheckoutsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a hosted checkout session.
   *
   * **Hosted checkout is currently EVM-only.** While the API accepts
   * `chain: "solana"` or `chain: "tron"` on a checkout (and Solana / Tron
   * inbound deposits are detected to verified wallets at the chain-reader
   * layer), the customer-facing hosted checkout page only supports the EVM
   * chains: Base, Ethereum, Polygon, and Arbitrum. Non-EVM checkouts will
   * not render a payable page today.
   */
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
