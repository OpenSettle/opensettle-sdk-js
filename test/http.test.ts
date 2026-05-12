import { describe, it, expect, vi, beforeEach } from "vitest";
import { HttpClient } from "../src/http.js";
import {
  AuthenticationError,
  ConflictError,
  InvalidRequestError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  SettlementError,
  StepUpRequiredError,
  APIError,
} from "../src/errors.js";

const KEY = "sk_test_abcdefghij12345";
const WS = "ws_01HG";

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

type FetchMock = ReturnType<typeof vi.fn> & {
  mock: { calls: Array<[string | URL, RequestInit | undefined]> };
};

function asFetchMock(mock: ReturnType<typeof vi.fn>): FetchMock {
  return mock as unknown as FetchMock;
}

function envelope(code: string, message = "fail", param?: string, requestId = "req_test") {
  return { error: { code, message, ...(param ? { param } : {}), request_id: requestId } };
}

describe("HttpClient — config validation", () => {
  it("requires apiKey", () => {
    expect(
      () =>
        new HttpClient({ apiKey: "" as never, workspaceId: WS } as never),
    ).toThrow(/apiKey is required/);
  });

  it("requires workspaceId", () => {
    expect(
      () =>
        new HttpClient({ apiKey: KEY, workspaceId: "" as never } as never),
    ).toThrow(/workspaceId is required/);
  });

  it("rejects malformed apiKey prefix", () => {
    expect(
      () => new HttpClient({ apiKey: "pk_live_xxx", workspaceId: WS }),
    ).toThrow(/sk_live_/);
  });

  it("refuses sk_live_ when testMode=true", () => {
    expect(
      () =>
        new HttpClient({
          apiKey: "sk_live_abc",
          workspaceId: WS,
          testMode: true,
        }),
    ).toThrow(/refusing to send live traffic/);
  });

  it("refuses sk_test_ when testMode=false", () => {
    expect(
      () =>
        new HttpClient({
          apiKey: "sk_test_abc",
          workspaceId: WS,
          testMode: false,
        }),
    ).toThrow(/refusing to send to test API/);
  });

  it("trims trailing slash from baseUrl", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    const c = new HttpClient({
      apiKey: KEY,
      workspaceId: WS,
      baseUrl: "https://api.example.com/",
      fetch: fetchMock as unknown as typeof fetch,
    });
    await c.request("/customers");
    expect(asFetchMock(fetchMock).mock.calls[0]![0]).toBe(
      `https://api.example.com/v1/workspaces/${WS}/customers`,
    );
  });
});

describe("HttpClient — request shape", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  beforeEach(() => {
    fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    client = new HttpClient({
      apiKey: KEY,
      workspaceId: WS,
      baseUrl: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
    });
  });

  it("sets Authorization Bearer header", async () => {
    await client.request("/customers");
    const init = asFetchMock(fetchMock).mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).authorization).toBe(
      `Bearer ${KEY}`,
    );
  });

  it("emits a versioned User-Agent", async () => {
    await client.request("/customers");
    const init = asFetchMock(fetchMock).mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)["user-agent"]).toMatch(
      /^opensettle-node\/\d+\.\d+\.\d+$/,
    );
  });

  it("encodes query params and skips null/undefined", async () => {
    await client.request("/customers", {
      query: { limit: 10, cursor: undefined, status: null, q: "hi there" },
    });
    expect(asFetchMock(fetchMock).mock.calls[0]![0]).toBe(
      `https://api.example.com/v1/workspaces/${WS}/customers?limit=10&q=hi+there`,
    );
  });

  it("sends JSON body with content-type", async () => {
    await client.request("/customers", {
      method: "POST",
      body: { email: "a@b.co" },
    });
    const init = asFetchMock(fetchMock).mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "application/json",
    );
    expect(init.body).toBe(JSON.stringify({ email: "a@b.co" }));
  });

  it("auto-generates Idempotency-Key when idempotencyKey=true", async () => {
    await client.request("/customers", {
      method: "POST",
      body: {},
      idempotencyKey: true,
    });
    const init = asFetchMock(fetchMock).mock.calls[0]![1]!;
    expect(
      (init.headers as Record<string, string>)["idempotency-key"],
    ).toBeTruthy();
  });

  it("uses caller-supplied Idempotency-Key when given", async () => {
    await client.request("/customers", {
      method: "POST",
      body: {},
      idempotencyKey: "myKey-123",
    });
    const init = asFetchMock(fetchMock).mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe(
      "myKey-123",
    );
  });

  it("returns parsed JSON on 2xx", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "cus_1" }, 200));
    const r = await client.request<{ id: string }>("/customers/cus_1");
    expect(r.id).toBe("cus_1");
  });

  it("returns undefined on 204", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const r = await client.request("/customers/cus_1", { method: "DELETE" });
    expect(r).toBeUndefined();
  });
});

describe("HttpClient — error mapping", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  beforeEach(() => {
    fetchMock = vi.fn();
    client = new HttpClient({
      apiKey: KEY,
      workspaceId: WS,
      baseUrl: "https://api.example.com",
      fetch: fetchMock as unknown as typeof fetch,
      maxNetworkRetries: 0,
    });
  });

  it("maps 400/invalid_request to InvalidRequestError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelope("invalid_request", "bad email", "email"), 400),
    );
    await expect(client.request("/x")).rejects.toBeInstanceOf(
      InvalidRequestError,
    );
  });

  it("maps 401/unauthorized to AuthenticationError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelope("unauthorized", "bad key"), 401),
    );
    await expect(client.request("/x")).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });

  it("maps 401/aal_required to StepUpRequiredError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelope("aal_required", "step up"), 401),
    );
    await expect(client.request("/x")).rejects.toBeInstanceOf(
      StepUpRequiredError,
    );
  });

  it("maps 404/not_found to NotFoundError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelope("not_found", "no"), 404),
    );
    await expect(client.request("/x")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("maps 409/conflict to ConflictError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelope("conflict", "dup"), 409),
    );
    await expect(client.request("/x")).rejects.toBeInstanceOf(ConflictError);
  });

  it("maps 429/rate_limited to RateLimitError with retryAfter", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelope("rate_limited", "slow down"), 429, {
        "retry-after": "12",
      }),
    );
    const err = await client.request("/x").catch((e) => e);
    expect(err).toBeInstanceOf(RateLimitError);
    expect((err as RateLimitError).retryAfter).toBe(12);
  });

  it("maps 422/chain_reverted to SettlementError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelope("chain_reverted", "tx reverted"), 422),
    );
    await expect(client.request("/x")).rejects.toBeInstanceOf(
      SettlementError,
    );
  });

  it("maps 500/internal_error to APIError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelope("internal_error", "boom"), 500),
    );
    await expect(client.request("/x")).rejects.toBeInstanceOf(APIError);
  });

  it("maps unknown error code to APIError (forward-compat)", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: { code: "future_code", message: "x", request_id: "r" } }, 500),
    );
    await expect(client.request("/x")).rejects.toBeInstanceOf(APIError);
  });

  it("preserves request_id, status, param on error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(envelope("invalid_request", "bad", "email", "req_xyz"), 400),
    );
    const err = (await client
      .request("/x")
      .catch((e) => e)) as InvalidRequestError;
    expect(err.requestId).toBe("req_xyz");
    expect(err.param).toBe("email");
    expect(err.status).toBe(400);
  });
});

describe("HttpClient — retries", () => {
  it("retries 500 up to budget then throws", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(envelope("internal_error"), 500),
    );
    const client = new HttpClient({
      apiKey: KEY,
      workspaceId: WS,
      fetch: fetchMock as unknown as typeof fetch,
      maxNetworkRetries: 2,
      timeoutMs: 100,
    });
    await expect(client.request("/x")).rejects.toBeInstanceOf(APIError);
    // initial + 2 retries = 3 total calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry 4xx user errors", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(envelope("invalid_request"), 400),
    );
    const client = new HttpClient({
      apiKey: KEY,
      workspaceId: WS,
      fetch: fetchMock as unknown as typeof fetch,
      maxNetworkRetries: 5,
    });
    await expect(client.request("/x")).rejects.toBeInstanceOf(
      InvalidRequestError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries network errors", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    const client = new HttpClient({
      apiKey: KEY,
      workspaceId: WS,
      fetch: fetchMock as unknown as typeof fetch,
      maxNetworkRetries: 2,
    });
    const r = await client.request<{ ok: boolean }>("/x");
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws NetworkError after budget exhausted", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const client = new HttpClient({
      apiKey: KEY,
      workspaceId: WS,
      fetch: fetchMock as unknown as typeof fetch,
      maxNetworkRetries: 1,
    });
    await expect(client.request("/x")).rejects.toBeInstanceOf(NetworkError);
  });

  it("retries 429 honoring Retry-After", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(envelope("rate_limited"), 429, { "retry-after": "0" }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }, 200));
    const client = new HttpClient({
      apiKey: KEY,
      workspaceId: WS,
      fetch: fetchMock as unknown as typeof fetch,
      maxNetworkRetries: 2,
    });
    const r = await client.request<{ ok: boolean }>("/x");
    expect(r.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
