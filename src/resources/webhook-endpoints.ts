import type { HttpClient } from "../http.js";
import type {
  WebhookEndpoint,
  CreateWebhookEndpointRequest,
  CreateWebhookEndpointResponse,
} from "./types.js";

export class WebhookEndpointsResource {
  constructor(private readonly http: HttpClient) {}

  list(): Promise<{ data: WebhookEndpoint[] }> {
    return this.http.request("/webhook_endpoints");
  }

  retrieve(endpointId: string): Promise<WebhookEndpoint> {
    return this.http.request(
      `/webhook_endpoints/${encodeURIComponent(endpointId)}`,
    );
  }

  /**
   * Create a new endpoint. The response includes the plaintext signing
   * secret exactly once — store it now; OpenSettle will not show it again.
   */
  create(
    input: CreateWebhookEndpointRequest,
  ): Promise<CreateWebhookEndpointResponse> {
    return this.http.request("/webhook_endpoints", {
      method: "POST",
      body: input,
      idempotencyKey: true,
    });
  }

  update(
    endpointId: string,
    input: Partial<{ url: string; description: string; events: string[]; status: "enabled" | "disabled" }>,
  ): Promise<WebhookEndpoint> {
    return this.http.request(
      `/webhook_endpoints/${encodeURIComponent(endpointId)}`,
      { method: "PATCH", body: input },
    );
  }

  del(endpointId: string): Promise<void> {
    return this.http.request(
      `/webhook_endpoints/${encodeURIComponent(endpointId)}`,
      { method: "DELETE" },
    );
  }

  /**
   * Rotate the signing secret. Returns the new plaintext secret + the
   * grace window during which the previous secret will continue to verify.
   */
  rotateSecret(
    endpointId: string,
    body?: { graceSeconds?: number },
  ): Promise<{ secret: string; rotationGraceUntil: string }> {
    return this.http.request(
      `/webhook_endpoints/${encodeURIComponent(endpointId)}/rotate`,
      { method: "POST", body: body ?? {}, idempotencyKey: true },
    );
  }

  /** Synchronously fire a sample event at the endpoint to verify wiring. */
  test(
    endpointId: string,
    body: { eventType: string },
  ): Promise<{ ok: boolean; status: number; latencyMs: number }> {
    return this.http.request(
      `/webhook_endpoints/${encodeURIComponent(endpointId)}/test`,
      { method: "POST", body },
    );
  }
}
