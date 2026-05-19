import { unwrap, type HttpClient } from "../http.js";
import type { ResourceCallOpts } from "./options.js";
import type { DeletedAck } from "./customers.js";
import type {
  WebhookEndpoint,
  CreateWebhookEndpointRequest,
  CreateWebhookEndpointResponse,
} from "./types.js";

/** Result of {@link WebhookEndpointsResource.test}. */
export type WebhookTestResult = {
  /** Synthetic event id the platform queued for delivery. */
  eventId: string;
};

export class WebhookEndpointsResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<{ data: WebhookEndpoint[] }> {
    return this.http.request("/webhook_endpoints");
  }

  async retrieve(endpointId: string): Promise<WebhookEndpoint> {
    const resp = await this.http.request<unknown>(
      `/webhook_endpoints/${encodeURIComponent(endpointId)}`,
    );
    return unwrap<WebhookEndpoint>(resp, "endpoint");
  }

  /**
   * Create a new endpoint. The response includes the plaintext signing
   * secret exactly once — store it now; OpenSettle will not show it again.
   * Multi-key envelope `{endpoint, signingSecret}` — both halves are
   * preserved.
   */
  create(
    input: CreateWebhookEndpointRequest,
    opts?: ResourceCallOpts,
  ): Promise<CreateWebhookEndpointResponse> {
    return this.http.request("/webhook_endpoints", {
      method: "POST",
      body: input,
      idempotencyKey: opts?.idempotencyKey ?? true,
    });
  }

  async update(
    endpointId: string,
    input: Partial<{
      url: string;
      description: string;
      events: string[];
      status: "enabled" | "disabled";
    }>,
  ): Promise<WebhookEndpoint> {
    const resp = await this.http.request<unknown>(
      `/webhook_endpoints/${encodeURIComponent(endpointId)}`,
      { method: "PATCH", body: input },
    );
    return unwrap<WebhookEndpoint>(resp, "endpoint");
  }

  /**
   * Remove the endpoint. The API returns `{ ok: true }` (HTTP 200) on
   * success. Available as `delete` (canonical name) and as the legacy
   * alias `del`.
   */
  delete(endpointId: string): Promise<DeletedAck> {
    return this.http.request(
      `/webhook_endpoints/${encodeURIComponent(endpointId)}`,
      { method: "DELETE" },
    );
  }

  /**
   * @deprecated Use {@link WebhookEndpointsResource.delete} instead.
   */
  del(endpointId: string): Promise<DeletedAck> {
    return this.delete(endpointId);
  }

  /**
   * Rotate the signing secret. Step-up auth (AAL=2) required — API-key
   * callers with full permissions receive `StepUpRequiredError`; lesser
   * keys receive `ForbiddenError`.
   *
   * Returns the same `{endpoint, signingSecret}` envelope as `create`;
   * store `signingSecret` immediately. The previous secret continues to
   * verify until its rotation-grace window expires (server-side default).
   */
  rotateSecret(
    endpointId: string,
    opts?: ResourceCallOpts,
  ): Promise<CreateWebhookEndpointResponse> {
    return this.http.request(
      `/webhook_endpoints/${encodeURIComponent(endpointId)}/rotate`,
      {
        method: "POST",
        body: {},
        idempotencyKey: opts?.idempotencyKey ?? true,
      },
    );
  }

  /**
   * Queue a synthetic event for delivery to the endpoint to verify the
   * wiring end-to-end. Returns the queued event's id so callers can
   * inspect the resulting delivery in the dashboard.
   *
   * The event type is server-chosen (currently a sentinel `webhook.test`
   * payload); call this without arguments.
   */
  test(endpointId: string, opts?: ResourceCallOpts): Promise<WebhookTestResult> {
    return this.http.request(
      `/webhook_endpoints/${encodeURIComponent(endpointId)}/test`,
      { method: "POST", idempotencyKey: opts?.idempotencyKey ?? true },
    );
  }
}
