import type { HttpClient } from "../http.js";
import type { Checkout, CreateCheckoutRequest } from "./types.js";

export class CheckoutsResource {
  constructor(private readonly http: HttpClient) {}

  create(input: CreateCheckoutRequest): Promise<Checkout> {
    return this.http.request("/checkouts", {
      method: "POST",
      body: input,
      idempotencyKey: true,
    });
  }

  retrieve(id: string): Promise<Checkout> {
    return this.http.request(`/checkouts/${encodeURIComponent(id)}`);
  }
}
