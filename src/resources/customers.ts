import { unwrap, type HttpClient } from "../http.js";
import type { ResourceCallOpts } from "./options.js";
import type {
  Customer,
  CreateCustomerRequest,
  UpdateCustomerRequest,
  CursorPage,
} from "./types.js";

export type ListCustomersQuery = {
  cursor?: string;
  limit?: number;
  status?: "active" | "at_risk" | "churned";
  q?: string;
};

export type DeletedAck = { ok: boolean };

export class CustomersResource {
  constructor(private readonly http: HttpClient) {}

  async list(query?: ListCustomersQuery): Promise<CursorPage<Customer>> {
    return this.http.request("/customers", { query });
  }

  async retrieve(customerId: string): Promise<Customer> {
    const resp = await this.http.request<unknown>(
      `/customers/${encodeURIComponent(customerId)}`,
    );
    return unwrap<Customer>(resp, "customer");
  }

  async create(
    input: CreateCustomerRequest,
    opts?: ResourceCallOpts,
  ): Promise<Customer> {
    const resp = await this.http.request<unknown>("/customers", {
      method: "POST",
      body: input,
      idempotencyKey: opts?.idempotencyKey ?? true,
    });
    return unwrap<Customer>(resp, "customer");
  }

  async update(
    customerId: string,
    input: UpdateCustomerRequest,
  ): Promise<Customer> {
    const resp = await this.http.request<unknown>(
      `/customers/${encodeURIComponent(customerId)}`,
      { method: "PATCH", body: input },
    );
    return unwrap<Customer>(resp, "customer");
  }

  /**
   * Soft-delete: PII is scrubbed; historical references still resolve.
   * The API returns `{ ok: true }` (HTTP 200) on success.
   *
   * Available as `delete` (canonical name) and as the legacy alias `del`.
   */
  delete(customerId: string): Promise<DeletedAck> {
    return this.http.request(`/customers/${encodeURIComponent(customerId)}`, {
      method: "DELETE",
    });
  }

  /**
   * @deprecated Use {@link CustomersResource.delete} instead. Kept as a
   * stable alias because `delete` is a reserved word in older JS engines —
   * this import-friendly form predates the rename and remains supported.
   */
  del(customerId: string): Promise<DeletedAck> {
    return this.delete(customerId);
  }
}
