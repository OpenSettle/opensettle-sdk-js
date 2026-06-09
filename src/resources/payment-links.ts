import { unwrap, type HttpClient } from "../http.js";
import type { ResourceCallOpts } from "./options.js";
import type { DeletedAck } from "./customers.js";
import type { CreatePaymentLinkRequest, PaymentLink } from "./types.js";

/**
 * Reusable payment links.
 *
 * A payment link fixes the settlement rail (`chain` + `token`) and an amount
 * source, then exposes a public `/pay/:token` URL that spawns a fresh
 * checkout per buyer — the share-on-a-pricing-page / send-in-an-email
 * counterpart to a single-use {@link CheckoutsResource} session.
 *
 * Auth: create + deactivate require a `developer` (or higher) role; an API
 * key satisfies that. Live-mode links additionally require an approved KYB
 * workspace, mirroring hosted-checkout creation.
 */
export class PaymentLinksResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Create a reusable payment link. Supply **exactly one** amount source —
   * `priceId`, a fixed `amount` (minor units), or `openAmount: true` — plus
   * the required `chain` + `token`. A fixed `amount` or `openAmount` link also
   * requires a `description`.
   *
   * Sends an `Idempotency-Key` by default; pass `opts.idempotencyKey` to tie
   * it to a domain object you already own.
   */
  async create(
    input: CreatePaymentLinkRequest,
    opts?: ResourceCallOpts,
  ): Promise<PaymentLink> {
    const resp = await this.http.request<unknown>("/payment_links", {
      method: "POST",
      body: input,
      idempotencyKey: opts?.idempotencyKey ?? true,
    });
    return unwrap<PaymentLink>(resp, "paymentLink");
  }

  /**
   * List the workspace's payment links. Returns the array directly (this
   * endpoint is not cursor-paginated).
   */
  async list(): Promise<PaymentLink[]> {
    const resp = await this.http.request<{ data: PaymentLink[] }>(
      "/payment_links",
    );
    return resp.data;
  }

  /**
   * Deactivate a payment link. Its public `/pay/:token` URL stops spawning
   * new checkouts; checkouts already created from it are unaffected. The API
   * returns `{ ok: true }` (HTTP 200).
   *
   * Available as `deactivate` (canonical name) and as the alias `del`.
   */
  deactivate(id: string): Promise<DeletedAck> {
    return this.http.request(`/payment_links/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  /**
   * Alias for {@link PaymentLinksResource.deactivate}, matching the
   * `delete`/`del` shorthand the other resources expose.
   */
  del(id: string): Promise<DeletedAck> {
    return this.deactivate(id);
  }
}
