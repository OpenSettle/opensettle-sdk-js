import { unwrap, type HttpClient } from "../http.js";
import type { ResourceCallOpts } from "./options.js";
import type {
  Invoice,
  InvoiceStatus,
  CreateInvoiceRequest,
  CursorPage,
} from "./types.js";

export type ListInvoicesQuery = {
  cursor?: string;
  limit?: number;
  customerId?: string;
  status?: InvoiceStatus;
  /**
   * Inclusive lower bound on `createdAt`. Any ISO-8601 string (e.g.
   * `"2026-04-01"` or `"2026-04-01T00:00:00Z"`). Pairs with `to` to
   * window a reporting period.
   */
  from?: string;
  /** Inclusive upper bound on `createdAt`. ISO-8601; must be >= `from`. */
  to?: string;
};

export class InvoicesResource {
  constructor(private readonly http: HttpClient) {}

  async list(query?: ListInvoicesQuery): Promise<CursorPage<Invoice>> {
    return this.http.request("/invoices", { query });
  }

  async retrieve(invoiceId: string): Promise<Invoice> {
    const resp = await this.http.request<unknown>(
      `/invoices/${encodeURIComponent(invoiceId)}`,
    );
    return unwrap<Invoice>(resp, "invoice");
  }

  async create(
    input: CreateInvoiceRequest,
    opts?: ResourceCallOpts,
  ): Promise<Invoice> {
    const resp = await this.http.request<unknown>("/invoices", {
      method: "POST",
      body: input,
      idempotencyKey: opts?.idempotencyKey ?? true,
    });
    return unwrap<Invoice>(resp, "invoice");
  }

  /** Email the hosted invoice link to the customer. */
  async send(invoiceId: string, opts?: ResourceCallOpts): Promise<Invoice> {
    const resp = await this.http.request<unknown>(
      `/invoices/${encodeURIComponent(invoiceId)}/send`,
      { method: "POST", idempotencyKey: opts?.idempotencyKey ?? true },
    );
    return unwrap<Invoice>(resp, "invoice");
  }

  /** Re-send a reminder for an unpaid invoice. */
  async remind(invoiceId: string, opts?: ResourceCallOpts): Promise<Invoice> {
    const resp = await this.http.request<unknown>(
      `/invoices/${encodeURIComponent(invoiceId)}/reminder`,
      { method: "POST", idempotencyKey: opts?.idempotencyKey ?? true },
    );
    return unwrap<Invoice>(resp, "invoice");
  }

  async void(invoiceId: string): Promise<Invoice> {
    const resp = await this.http.request<unknown>(
      `/invoices/${encodeURIComponent(invoiceId)}/void`,
      { method: "POST" },
    );
    return unwrap<Invoice>(resp, "invoice");
  }
}
