import { describe, it, expect, vi } from "vitest";
import { OpenSettle, SDK_VERSION } from "../src/index.js";
import packageJson from "../package.json" with { type: "json" };

const KEY = "sk_test_abcdefghij12345";
const WS = "ws_01HG";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenSettle client wiring", () => {
  it("SDK_VERSION matches package.json — single source of truth", () => {
    expect(SDK_VERSION).toBe(packageJson.version);
  });

  it("lazy-instantiates resources", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "cus_1" }));
    const os = new OpenSettle({
      apiKey: KEY,
      workspaceId: WS,
      baseUrl: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(os.customers).toBe(os.customers); // memoised
    await os.customers.retrieve("cus_1");
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(
      `https://api.example.com/v1/workspaces/${WS}/customers/cus_1`,
    );
  });

  it("encodes path params (defends against id with reserved chars)", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "ok" }));
    const os = new OpenSettle({
      apiKey: KEY,
      workspaceId: WS,
      baseUrl: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await os.customers.retrieve("cus/with slash");
    expect((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[0]).toBe(
      `https://api.example.com/v1/workspaces/${WS}/customers/cus%2Fwith%20slash`,
    );
  });

  it("payments.refund includes idempotency key by default", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ payment: {} }));
    const os = new OpenSettle({
      apiKey: KEY,
      workspaceId: WS,
      baseUrl: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await os.payments.refund("pay_1", { amountMinor: 100 });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(
      (init.headers as Record<string, string>)["idempotency-key"],
    ).toBeTruthy();
  });

  it("subscriptions.cancel sends mode in body", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ id: "sub_1" }));
    const os = new OpenSettle({
      apiKey: KEY,
      workspaceId: WS,
      baseUrl: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await os.subscriptions.cancel("sub_1", { mode: "at_period_end" });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(init.body as string)).toStrictEqual({
      mode: "at_period_end",
    });
  });

  it("invoices.list passes query params (order-independent)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ data: [], nextCursor: null }),
    );
    const os = new OpenSettle({
      apiKey: KEY,
      workspaceId: WS,
      baseUrl: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await os.invoices.list({ customerId: "cus_1", status: "open", limit: 5 });
    const url = new URL((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[0] as string);
    expect(url.pathname).toBe(`/v1/workspaces/${WS}/invoices`);
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("customerId")).toBe("cus_1");
    expect(url.searchParams.get("status")).toBe("open");
  });

  it("webhookEndpoints.create returns endpoint + secret", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        endpoint: { id: "we_1", url: "https://x.example.com/h" },
        secret: "whsec_xxx",
      }),
    );
    const os = new OpenSettle({
      apiKey: KEY,
      workspaceId: WS,
      baseUrl: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
    const r = await os.webhookEndpoints.create({
      url: "https://x.example.com/h",
      events: ["payment.confirmed"],
    });
    expect(r).toMatchObject({
      endpoint: { id: "we_1" },
      secret: "whsec_xxx",
    });
  });
});
