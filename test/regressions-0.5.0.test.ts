/**
 * Regression tests for bugs caught in the 2026-05-14 deep audit.
 *
 * Each section maps 1:1 to a finding:
 *
 *   - subscriptions.{cancel,pause,resume} now send `Idempotency-Key`
 *     (the API requires it; pre-0.5.0 SDK omitted it and 400d).
 *   - webhookEndpoints.test() returns `{eventId}` and queues the request
 *     against the route the API actually exposes (no synthetic body shape).
 *   - webhookEndpoints.rotateSecret() no longer accepts a body the API
 *     would silently drop.
 *   - {customers,webhookEndpoints}.delete() canonical name; `del` is a
 *     deprecated alias that delegates to it. The API returns
 *     `{ok: true}` (HTTP 200), and that's what callers see.
 *   - Caller-supplied `idempotencyKey` via the trailing
 *     `ResourceCallOpts` is honoured across every state-mutating method.
 *   - `restricted_jurisdiction` envelopes round-trip into the dedicated
 *     `RestrictedJurisdictionError` (subclass of `ForbiddenError`),
 *     surfacing the `metadata` payload for the dashboard refusal page.
 *   - `verifyWebhook` accepts `Buffer` and `Uint8Array` raw bodies and
 *     refuses an empty `secret` upfront.
 */

import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  OpenSettle,
  OpenSettleError,
  ForbiddenError,
  RestrictedJurisdictionError,
  AttestationRequiredError,
  WebhookSecretError,
  verifyWebhook,
} from "../src/index.js";
import { fromEnvelope } from "../src/errors.js";

const KEY = "sk_test_abcdefghij12345";
const WS = "ws_01HG";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function makeClient(fetchMock: ReturnType<typeof vi.fn>) {
  return new OpenSettle({
    apiKey: KEY,
    workspaceId: WS,
    baseUrl: "https://api.example.com",
    fetch: fetchMock as unknown as typeof fetch,
  });
}

function init(fetchMock: ReturnType<typeof vi.fn>, callIdx = 0): RequestInit {
  return (fetchMock.mock.calls[callIdx] as unknown as [string, RequestInit])[1];
}

function url(fetchMock: ReturnType<typeof vi.fn>, callIdx = 0): string {
  return (fetchMock.mock.calls[callIdx] as unknown as [string, RequestInit])[0];
}

function header(req: RequestInit, name: string): string | undefined {
  return (req.headers as Record<string, string>)[name.toLowerCase()];
}

describe("subscriptions: state-mutating routes attach Idempotency-Key (regression: pre-0.5.0 omitted it and 400d)", () => {
  it("subscriptions.cancel sends Idempotency-Key (default)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ subscription: { id: "sub_1" } }),
    );
    await makeClient(fetchMock).subscriptions.cancel("sub_1");
    expect(header(init(fetchMock), "idempotency-key")).toBeTruthy();
  });

  it("subscriptions.pause sends Idempotency-Key (default)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ subscription: { id: "sub_1" } }),
    );
    await makeClient(fetchMock).subscriptions.pause("sub_1");
    expect(header(init(fetchMock), "idempotency-key")).toBeTruthy();
  });

  it("subscriptions.resume sends Idempotency-Key (default)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ subscription: { id: "sub_1" } }),
    );
    await makeClient(fetchMock).subscriptions.resume("sub_1");
    expect(header(init(fetchMock), "idempotency-key")).toBeTruthy();
  });

  it("subscriptions.cancel honours caller-supplied idempotencyKey", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ subscription: { id: "sub_1" } }),
    );
    await makeClient(fetchMock).subscriptions.cancel(
      "sub_1",
      { mode: "immediately" },
      { idempotencyKey: "domain-cancel-42" },
    );
    expect(header(init(fetchMock), "idempotency-key")).toBe("domain-cancel-42");
  });

  it("subscriptions.pause / resume honour caller-supplied idempotencyKey", async () => {
    const pauseMock = vi.fn(async () =>
      jsonResponse({ subscription: { id: "sub_1" } }),
    );
    await makeClient(pauseMock).subscriptions.pause("sub_1", {
      idempotencyKey: "domain-pause-7",
    });
    expect(header(init(pauseMock), "idempotency-key")).toBe("domain-pause-7");

    const resumeMock = vi.fn(async () =>
      jsonResponse({ subscription: { id: "sub_1" } }),
    );
    await makeClient(resumeMock).subscriptions.resume("sub_1", {
      idempotencyKey: "domain-resume-7",
    });
    expect(header(init(resumeMock), "idempotency-key")).toBe("domain-resume-7");
  });
});

describe("ResourceCallOpts: caller-supplied idempotencyKey is honoured everywhere", () => {
  it("customers.create", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ customer: { id: "cus_1" } }),
    );
    await makeClient(fetchMock).customers.create(
      { email: "a@b.co", name: "Ada" },
      { idempotencyKey: "cus-make-9" },
    );
    expect(header(init(fetchMock), "idempotency-key")).toBe("cus-make-9");
  });

  it("invoices.create", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ invoice: { id: "in_1" } }),
    );
    await makeClient(fetchMock).invoices.create(
      {
        customerId: "cus_1",
        chain: "base",
        token: "USDC",
        currency: "USD",
        dueInDays: 14,
        lineItems: [{ description: "x", quantity: 1, unitAmountMinor: 100 }],
      },
      { idempotencyKey: "inv-order-99" },
    );
    expect(header(init(fetchMock), "idempotency-key")).toBe("inv-order-99");
  });

  it("invoices.send / remind", async () => {
    const sendMock = vi.fn(async () =>
      jsonResponse({ invoice: { id: "in_1" } }),
    );
    await makeClient(sendMock).invoices.send("in_1", {
      idempotencyKey: "inv-send-1",
    });
    expect(header(init(sendMock), "idempotency-key")).toBe("inv-send-1");

    const remindMock = vi.fn(async () =>
      jsonResponse({ invoice: { id: "in_1" } }),
    );
    await makeClient(remindMock).invoices.remind("in_1", {
      idempotencyKey: "inv-remind-1",
    });
    expect(header(init(remindMock), "idempotency-key")).toBe("inv-remind-1");
  });

  it("checkouts.create", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ checkout: { id: "ch_1" } }),
    );
    await makeClient(fetchMock).checkouts.create(
      {
        mode: "subscription",
        customerEmail: "a@b.co",
        priceId: "price_1",
        successUrl: "https://x.com/ok",
        expiresInMinutes: 30,
      },
      { idempotencyKey: "checkout-order-7" },
    );
    expect(header(init(fetchMock), "idempotency-key")).toBe("checkout-order-7");
  });

  it("payments.refund / refundBroadcast", async () => {
    const refundMock = vi.fn(async () =>
      jsonResponse({ payment: { id: "pay_1" }, unsignedTx: { to: "0x" } }),
    );
    await makeClient(refundMock).payments.refund(
      "pay_1",
      { amountMinor: 100 },
      { idempotencyKey: "refund-domain-1" },
    );
    expect(header(init(refundMock), "idempotency-key")).toBe("refund-domain-1");

    const bcastMock = vi.fn(async () =>
      jsonResponse({ payment: { id: "pay_1" } }),
    );
    await makeClient(bcastMock).payments.refundBroadcast(
      "pay_1",
      { refundTxHash: "0xdead" },
      { idempotencyKey: "bcast-domain-1" },
    );
    expect(header(init(bcastMock), "idempotency-key")).toBe("bcast-domain-1");
  });

  it("subscriptions.create / changePlan", async () => {
    const createMock = vi.fn(async () =>
      jsonResponse({ subscription: { id: "sub_1" } }),
    );
    await makeClient(createMock).subscriptions.create(
      {
        customerId: "cus_1",
        priceId: "price_1",
        chain: "base",
        token: "USDC",
        autopay: "manual",
      },
      { idempotencyKey: "sub-create-domain" },
    );
    expect(header(init(createMock), "idempotency-key")).toBe(
      "sub-create-domain",
    );

    const changeMock = vi.fn(async () =>
      jsonResponse({ subscription: { id: "sub_1" } }),
    );
    await makeClient(changeMock).subscriptions.changePlan(
      "sub_1",
      { priceId: "price_2" },
      { idempotencyKey: "sub-change-domain" },
    );
    expect(header(init(changeMock), "idempotency-key")).toBe(
      "sub-change-domain",
    );
  });

  it("webhookEndpoints.create / rotateSecret / test", async () => {
    const createMock = vi.fn(async () =>
      jsonResponse({
        endpoint: { id: "we_1" },
        signingSecret: "whsec_x",
      }),
    );
    await makeClient(createMock).webhookEndpoints.create(
      { url: "https://x.example.com/h", events: ["payment.confirmed"] },
      { idempotencyKey: "we-create-1" },
    );
    expect(header(init(createMock), "idempotency-key")).toBe("we-create-1");

    const rotateMock = vi.fn(async () =>
      jsonResponse({
        endpoint: { id: "we_1" },
        signingSecret: "whsec_y",
      }),
    );
    await makeClient(rotateMock).webhookEndpoints.rotateSecret("we_1", {
      idempotencyKey: "we-rotate-1",
    });
    expect(header(init(rotateMock), "idempotency-key")).toBe("we-rotate-1");

    const testMock = vi.fn(async () => jsonResponse({ eventId: "evt_1" }));
    await makeClient(testMock).webhookEndpoints.test("we_1", {
      idempotencyKey: "we-test-1",
    });
    expect(header(init(testMock), "idempotency-key")).toBe("we-test-1");
  });
});

describe("webhookEndpoints: signatures match the real API (regression: pre-0.5.0 fabricated body/return)", () => {
  it("test() does not send an `eventType` body and returns {eventId}", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ eventId: "evt_42" }));
    const result = await makeClient(fetchMock).webhookEndpoints.test("we_1");
    expect(url(fetchMock)).toBe(
      `https://api.example.com/v1/workspaces/${WS}/webhook_endpoints/we_1/test`,
    );
    expect((init(fetchMock).body as string) ?? "").toBe("");
    expect(result).toStrictEqual({ eventId: "evt_42" });
  });

  it("rotateSecret() sends an empty body (the API ignores any caller body)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        endpoint: { id: "we_1" },
        signingSecret: "whsec_new",
      }),
    );
    await makeClient(fetchMock).webhookEndpoints.rotateSecret("we_1");
    expect(JSON.parse(init(fetchMock).body as string)).toStrictEqual({});
  });
});

describe("delete naming: canonical `delete` + `del` alias both hit the DELETE route and surface the API ack", () => {
  it("customers.delete returns {ok: true} (the actual API shape)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }, 200));
    const r = await makeClient(fetchMock).customers.delete("cus_1");
    expect(r).toStrictEqual({ ok: true });
    expect((init(fetchMock).method ?? "").toUpperCase()).toBe("DELETE");
  });

  it("customers.del is an alias delegating to delete()", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }, 200));
    const r = await makeClient(fetchMock).customers.del("cus_1");
    expect(r).toStrictEqual({ ok: true });
  });

  it("webhookEndpoints.delete returns {ok: true}", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }, 200));
    const r = await makeClient(fetchMock).webhookEndpoints.delete("we_1");
    expect(r).toStrictEqual({ ok: true });
  });

  it("webhookEndpoints.del is an alias delegating to delete()", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }, 200));
    const r = await makeClient(fetchMock).webhookEndpoints.del("we_1");
    expect(r).toStrictEqual({ ok: true });
  });
});

describe("error mapping: restricted_jurisdiction round-trips (regression: previously fell through to APIError)", () => {
  it("envelope { error: { code: 'restricted_jurisdiction', metadata } } → RestrictedJurisdictionError with metadata", () => {
    const err = fromEnvelope(
      {
        error: {
          code: "restricted_jurisdiction",
          message: "Refused: jurisdiction not on the allowlist",
          request_id: "req_xyz",
          metadata: { code: "US-NY", name: "New York", reason: "BitLicense pending" },
        },
      },
      403,
      null,
    );
    expect(err).toBeInstanceOf(RestrictedJurisdictionError);
    // Subclass relationship preserved so generic forbidden handlers still fire.
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err.code).toBe("restricted_jurisdiction");
    expect(err.status).toBe(403);
    expect(err.requestId).toBe("req_xyz");
    expect(err.metadata).toStrictEqual({
      code: "US-NY",
      name: "New York",
      reason: "BitLicense pending",
    });
  });

  it("generic forbidden envelopes still produce ForbiddenError (non-restricted)", () => {
    const err = fromEnvelope(
      { error: { code: "forbidden", message: "no", request_id: "req_a" } },
      403,
      null,
    );
    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err).not.toBeInstanceOf(RestrictedJurisdictionError);
  });

  it("metadata is null when the envelope omits it (back-compat)", () => {
    const err = fromEnvelope(
      { error: { code: "invalid_request", message: "x", request_id: "req_b" } },
      400,
      null,
    );
    expect(err.metadata).toBeNull();
  });
});

describe("error mapping: attestation_required round-trips (regression: previously fell through to APIError as internal_error)", () => {
  it("envelope { error: { code: 'attestation_required', metadata } } → AttestationRequiredError with code + metadata preserved", () => {
    const err = fromEnvelope(
      {
        error: {
          code: "attestation_required",
          message: "Attestation required before prepare-payment",
          request_id: "req_att",
          metadata: { category: "cbd_hemp", requiredAge: 21 },
        },
      },
      412,
      null,
    );
    expect(err).toBeInstanceOf(AttestationRequiredError);
    expect(err).toBeInstanceOf(OpenSettleError);
    // 412 is not a 403 — must NOT be a ForbiddenError.
    expect(err).not.toBeInstanceOf(ForbiddenError);
    expect(err.code).toBe("attestation_required");
    expect(err.status).toBe(412);
    expect(err.requestId).toBe("req_att");
    expect(err.metadata).toStrictEqual({ category: "cbd_hemp", requiredAge: 21 });
  });
});

describe("verifyWebhook: rawBody accepts string | Buffer | Uint8Array; secret must be non-empty", () => {
  const SECRET = "whsec_test_secret";
  const bodyJson = '{"id":"evt_1","type":"payment.confirmed","created":"2026-01-01"}';
  const ts = 1_700_000_000;

  function sign(rawBody: string | Buffer): string {
    const tsBuf = Buffer.from(`${ts}.`, "utf8");
    const h = createHmac("sha256", SECRET);
    h.update(tsBuf);
    h.update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody);
    return `t=${ts},v1=${h.digest("hex")}`;
  }

  it("string body still verifies (back-compat)", () => {
    const r = verifyWebhook<{ id: string }>({
      rawBody: bodyJson,
      signatureHeader: sign(bodyJson),
      secret: SECRET,
      now: ts,
    });
    expect(r.data.id).toBe("evt_1");
  });

  it("Buffer body verifies — same bytes, no UTF-8 round-trip", () => {
    const buf = Buffer.from(bodyJson, "utf8");
    const r = verifyWebhook<{ id: string }>({
      rawBody: buf,
      signatureHeader: sign(buf),
      secret: SECRET,
      now: ts,
    });
    expect(r.data.id).toBe("evt_1");
  });

  it("Uint8Array body verifies", () => {
    const buf = new Uint8Array(Buffer.from(bodyJson, "utf8"));
    const r = verifyWebhook<{ id: string }>({
      rawBody: buf,
      signatureHeader: sign(Buffer.from(buf)),
      secret: SECRET,
      now: ts,
    });
    expect(r.data.id).toBe("evt_1");
  });

  it("multi-byte UTF-8 body verifies (regression: prior string-only path could re-encode)", () => {
    const multibyte = '{"description":"über — café 💸 üñïcôdé"}';
    const buf = Buffer.from(multibyte, "utf8");
    const r = verifyWebhook<{ description: string }>({
      rawBody: buf,
      signatureHeader: sign(buf),
      secret: SECRET,
      now: ts,
    });
    expect(r.data.description).toBe("über — café 💸 üñïcôdé");
  });

  it("empty secret throws WebhookSecretError before doing any HMAC work", () => {
    expect(() =>
      verifyWebhook({
        rawBody: bodyJson,
        signatureHeader: "t=1,v1=ab",
        secret: "",
        now: ts,
      }),
    ).toThrowError(WebhookSecretError);
  });
});
