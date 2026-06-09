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

  it("webhookEndpoints.create returns endpoint + signingSecret (multi-key envelope preserved)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        endpoint: { id: "we_1", url: "https://x.example.com/h" },
        signingSecret: "whsec_xxx",
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
      signingSecret: "whsec_xxx",
    });
  });

  describe("envelope unwrapping (0.3.0)", () => {
    function client(fetchMock: ReturnType<typeof vi.fn>) {
      return new OpenSettle({
        apiKey: KEY,
        workspaceId: WS,
        baseUrl: "https://api.example.com",
        fetch: fetchMock as unknown as typeof fetch,
      });
    }

    it("customers.create unwraps {customer: …} to the Customer", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          customer: { id: "cus_1", email: "a@b.co", createdAt: "2026-01-01" },
        }),
      );
      const r = await client(fetchMock).customers.create({
        email: "a@b.co",
        name: "Ada",
      });
      expect(r.id).toBe("cus_1");
      expect(r.email).toBe("a@b.co");
      // The wrapper key is stripped.
      expect((r as { customer?: unknown }).customer).toBeUndefined();
    });

    it("customers.retrieve unwraps {customer: …}", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ customer: { id: "cus_1" } }),
      );
      const r = await client(fetchMock).customers.retrieve("cus_1");
      expect(r.id).toBe("cus_1");
    });

    it("products.create unwraps {product: …}", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ product: { id: "prod_1", name: "Pro" } }),
      );
      const r = await client(fetchMock).products.create({ name: "Pro" });
      expect(r.id).toBe("prod_1");
      expect(r.name).toBe("Pro");
    });

    it("products.createPrice unwraps {price: …}", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          price: { id: "price_1", amount: 1999, currency: "USD", interval: "month" },
        }),
      );
      const r = await client(fetchMock).products.createPrice("prod_1", {
        amount: 1999,
        currency: "USD",
        interval: "month",
      });
      expect(r.id).toBe("price_1");
      expect(r.amount).toBe(1999);
    });

    it("invoices.create unwraps {invoice: …}", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ invoice: { id: "in_1", amountMinor: 19900 } }),
      );
      const r = await client(fetchMock).invoices.create({
        customerId: "cus_1",
        chain: "base",
        token: "USDC",
        currency: "USD",
        dueInDays: 14,
        lineItems: [{ description: "x", quantity: 1, unitAmountMinor: 19900 }],
      });
      expect(r.id).toBe("in_1");
    });

    it("subscriptions.create unwraps {subscription: …}", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ subscription: { id: "sub_1", status: "active" } }),
      );
      const r = await client(fetchMock).subscriptions.create({
        customerId: "cus_1",
        priceId: "price_1",
        chain: "base",
        token: "USDC",
        autopay: "manual",
      });
      expect(r.id).toBe("sub_1");
    });

    it("checkouts.create unwraps {checkout: …}", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ checkout: { id: "ch_1", successUrl: "https://x.com/ok" } }),
      );
      const r = await client(fetchMock).checkouts.create({
        mode: "subscription",
        customerEmail: "a@b.co",
        priceId: "price_1",
        successUrl: "https://x.com/ok",
        expiresInMinutes: 30,
      });
      expect(r.id).toBe("ch_1");
    });

    it("paymentLinks.create unwraps {paymentLink: …} and sends an idempotency key", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          paymentLink: {
            id: "pl_1",
            url: "https://opensettle.io/pay/tok_abc",
            amountMinor: 2500,
            openAmount: false,
            active: true,
          },
        }),
      );
      const r = await client(fetchMock).paymentLinks.create({
        amount: 2500,
        description: "Pro plan",
        chain: "base",
        token: "USDC",
      });
      expect(r.id).toBe("pl_1");
      expect(r.url).toBe("https://opensettle.io/pay/tok_abc");
      // The wrapper key is stripped.
      expect((r as { paymentLink?: unknown }).paymentLink).toBeUndefined();
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(`https://api.example.com/v1/workspaces/${WS}/payment_links`);
      expect(init.method).toBe("POST");
      expect(
        (init.headers as Record<string, string>)["idempotency-key"],
      ).toBeTruthy();
    });

    it("paymentLinks.list returns the raw array (not the {data} envelope)", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ data: [{ id: "pl_1" }, { id: "pl_2" }] }),
      );
      const r = await client(fetchMock).paymentLinks.list();
      expect(Array.isArray(r)).toBe(true);
      expect(r).toHaveLength(2);
      expect(r[0]!.id).toBe("pl_1");
    });

    it("paymentLinks.deactivate (and del alias) DELETEs and returns {ok}", async () => {
      const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
      const c = client(fetchMock);
      const r = await c.paymentLinks.deactivate("pl_1");
      expect(r.ok).toBe(true);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(
        `https://api.example.com/v1/workspaces/${WS}/payment_links/pl_1`,
      );
      expect(init.method).toBe("DELETE");
      // `del` is a thin alias for the same call.
      expect(c.paymentLinks.del).toBeTypeOf("function");
    });

    it("payments.retrieve unwraps {payment: …}", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ payment: { id: "pay_1", status: "confirmed" } }),
      );
      const r = await client(fetchMock).payments.retrieve("pay_1");
      expect(r.id).toBe("pay_1");
    });

    it("payments.refund PRESERVES multi-key {payment, unsignedTx} envelope", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          payment: { id: "pay_1" },
          unsignedTx: { chain: "base", to: "0xabc", instructions: "sign me" },
        }),
      );
      const r = await client(fetchMock).payments.refund("pay_1", {
        amountMinor: 100,
      });
      expect(r.payment.id).toBe("pay_1");
      expect(r.unsignedTx.to).toBe("0xabc");
    });

    it("payments.refundBroadcast sends refundTxHash (not txHash)", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ payment: { id: "pay_1", refundTxHash: "0xdead" } }),
      );
      await client(fetchMock).payments.refundBroadcast("pay_1", {
        refundTxHash: "0xdead",
      });
      const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
      expect(JSON.parse(init.body as string)).toStrictEqual({
        refundTxHash: "0xdead",
      });
    });

    it("subscriptions.cancel unwraps {subscription: …}", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({ subscription: { id: "sub_1", status: "canceled" } }),
      );
      const r = await client(fetchMock).subscriptions.cancel("sub_1", {
        mode: "immediately",
      });
      expect(r.id).toBe("sub_1");
      expect(r.status).toBe("canceled");
    });

    it("webhookEndpoints.rotateSecret returns full {endpoint, signingSecret}", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          endpoint: { id: "we_1", status: "enabled" },
          signingSecret: "whsec_new",
        }),
      );
      const r = await client(fetchMock).webhookEndpoints.rotateSecret("we_1");
      expect(r.endpoint.id).toBe("we_1");
      expect(r.signingSecret).toBe("whsec_new");
    });

    it("lists are NOT unwrapped — {data, nextCursor, hasMore} preserved", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          data: [{ id: "cus_1" }, { id: "cus_2" }],
          nextCursor: "cur_x",
          hasMore: true,
        }),
      );
      const r = await client(fetchMock).customers.list({ limit: 2 });
      expect(r.data).toHaveLength(2);
      expect(r.nextCursor).toBe("cur_x");
      expect(r.hasMore).toBe(true);
    });

    it("204 No Content (delete) returns undefined cleanly", async () => {
      const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
      const r = await client(fetchMock).customers.del("cus_1");
      expect(r).toBeUndefined();
    });
  });
});
