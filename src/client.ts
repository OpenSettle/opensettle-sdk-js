import { HttpClient, type ClientConfig } from "./http.js";
import { CustomersResource } from "./resources/customers.js";
import { CheckoutsResource } from "./resources/checkouts.js";
import { InvoicesResource } from "./resources/invoices.js";
import { PaymentsResource } from "./resources/payments.js";
import { SubscriptionsResource } from "./resources/subscriptions.js";
import { ProductsResource } from "./resources/products.js";
import { PaymentLinksResource } from "./resources/payment-links.js";
import { WebhookEndpointsResource } from "./resources/webhook-endpoints.js";

/**
 * Server-side OpenSettle client.
 *
 *   const os = new OpenSettle({
 *     apiKey: process.env.OPENSETTLE_KEY!,
 *     workspaceId: process.env.OPENSETTLE_WORKSPACE!,
 *   });
 *
 *   const customer = await os.customers.create({ email: "ada@example.com" });
 *   const invoice = await os.invoices.create({
 *     customerId: customer.id,
 *     amountMinor: 19_900,
 *     currency: "USD",
 *     chain: "base",
 *     token: "USDC",
 *     lineItems: [{ description: "Pro plan", quantity: 1, unitAmountMinor: 19_900 }],
 *   });
 *   await os.invoices.send(invoice.id);
 *
 * Resources are lazy-instantiated on first access — no eager allocation
 * for resources you don't use.
 */
export class OpenSettle {
  readonly http: HttpClient;

  private _customers?: CustomersResource;
  private _checkouts?: CheckoutsResource;
  private _invoices?: InvoicesResource;
  private _payments?: PaymentsResource;
  private _subscriptions?: SubscriptionsResource;
  private _products?: ProductsResource;
  private _paymentLinks?: PaymentLinksResource;
  private _webhookEndpoints?: WebhookEndpointsResource;

  constructor(config: ClientConfig) {
    this.http = new HttpClient(config);
  }

  get customers(): CustomersResource {
    return (this._customers ??= new CustomersResource(this.http));
  }
  get checkouts(): CheckoutsResource {
    return (this._checkouts ??= new CheckoutsResource(this.http));
  }
  get invoices(): InvoicesResource {
    return (this._invoices ??= new InvoicesResource(this.http));
  }
  get payments(): PaymentsResource {
    return (this._payments ??= new PaymentsResource(this.http));
  }
  get subscriptions(): SubscriptionsResource {
    return (this._subscriptions ??= new SubscriptionsResource(this.http));
  }
  get products(): ProductsResource {
    return (this._products ??= new ProductsResource(this.http));
  }
  get paymentLinks(): PaymentLinksResource {
    return (this._paymentLinks ??= new PaymentLinksResource(this.http));
  }
  get webhookEndpoints(): WebhookEndpointsResource {
    return (this._webhookEndpoints ??= new WebhookEndpointsResource(this.http));
  }
}
