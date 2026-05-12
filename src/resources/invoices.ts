import type { HttpClient } from "../http.js";
import type { Invoice, CreateInvoiceRequest, CursorPage } from "./types.js";

export type ListInvoicesQuery = {
  cursor?: string;
  limit?: number;
  customerId?: string;
  status?: string;
};

export class InvoicesResource {
  constructor(private readonly http: HttpClient) {}

  list(query?: ListInvoicesQuery): Promise<CursorPage<Invoice>> {
    return this.http.request("/invoices", { query });
  }

  retrieve(invoiceId: string): Promise<Invoice> {
    return this.http.request(`/invoices/${encodeURIComponent(invoiceId)}`);
  }

  create(input: CreateInvoiceRequest): Promise<Invoice> {
    return this.http.request("/invoices", {
      method: "POST",
      body: input,
      idempotencyKey: true,
    });
  }

  /** Email the hosted invoice link to the customer. */
  send(invoiceId: string): Promise<Invoice> {
    return this.http.request(
      `/invoices/${encodeURIComponent(invoiceId)}/send`,
      { method: "POST", idempotencyKey: true },
    );
  }

  /** Re-send a reminder for an unpaid invoice. */
  remind(invoiceId: string): Promise<Invoice> {
    return this.http.request(
      `/invoices/${encodeURIComponent(invoiceId)}/reminder`,
      { method: "POST", idempotencyKey: true },
    );
  }

  void(invoiceId: string): Promise<Invoice> {
    return this.http.request(
      `/invoices/${encodeURIComponent(invoiceId)}/void`,
      { method: "POST" },
    );
  }
}
