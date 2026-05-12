import type { HttpClient } from "../http.js";
import type {
  Customer,
  CreateCustomerRequest,
  UpdateCustomerRequest,
  CursorPage,
} from "./types.js";

export type ListCustomersQuery = {
  cursor?: string;
  limit?: number;
};

export class CustomersResource {
  constructor(private readonly http: HttpClient) {}

  list(query?: ListCustomersQuery): Promise<CursorPage<Customer>> {
    return this.http.request("/customers", { query });
  }

  retrieve(customerId: string): Promise<Customer> {
    return this.http.request(`/customers/${encodeURIComponent(customerId)}`);
  }

  create(input: CreateCustomerRequest): Promise<Customer> {
    return this.http.request("/customers", {
      method: "POST",
      body: input,
      idempotencyKey: true,
    });
  }

  update(
    customerId: string,
    input: UpdateCustomerRequest,
  ): Promise<Customer> {
    return this.http.request(`/customers/${encodeURIComponent(customerId)}`, {
      method: "PATCH",
      body: input,
    });
  }

  /** Soft-delete: PII is scrubbed; historical references still resolve. */
  del(customerId: string): Promise<void> {
    return this.http.request(`/customers/${encodeURIComponent(customerId)}`, {
      method: "DELETE",
    });
  }
}
