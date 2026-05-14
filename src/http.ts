import { SDK_VERSION } from "./version.js";
import {
  APIError,
  fromEnvelope,
  NetworkError,
  RateLimitError,
  type OpenSettleError,
} from "./errors.js";

/**
 * Thin fetch wrapper with the bits every API client needs:
 *
 *   - `Authorization: Bearer sk_…` from the SDK config
 *   - JSON body encoding + content-type
 *   - `Idempotency-Key` injection for money-adjacent writes (optional;
 *     auto-generated when the caller asks for one but doesn't supply
 *     a key)
 *   - Bounded retries with exponential backoff on 5xx + 429 (the only
 *     classes where retry has a chance of helping; 4xx user errors
 *     never retry)
 *   - Hard timeout via `AbortSignal.timeout`
 *   - Typed-error mapping via `fromEnvelope`
 *
 * Request bodies are arbitrary JSON-serialisable values; query params
 * stringify primitives and skip nulls.
 *
 * No external deps — this entire module is `fetch` + `crypto` (the
 * built-ins from Node 20+).
 */

export type ClientConfig = {
  /** `sk_live_…` or `sk_test_…`. Required. */
  apiKey: string;
  /** Workspace ID. Required (every merchant route is workspace-scoped). */
  workspaceId: string;
  /** Defaults to `https://api.opensettle.io`. Override for self-host / tests. */
  baseUrl?: string;
  /**
   * If set, forces the SDK to assert that the API key matches the
   * environment. With `testMode: true` we refuse `sk_live_…`; with
   * `testMode: false` we refuse `sk_test_…`. With `undefined` we accept
   * either and let the API decide. Useful as a circuit breaker in CI.
   */
  testMode?: boolean;
  /** Hard request timeout, ms. Default 30s. */
  timeoutMs?: number;
  /**
   * Max retries for retriable failures (5xx, 429, network errors).
   * Default 3. Set 0 to disable retry entirely.
   */
  maxNetworkRetries?: number;
  /**
   * If supplied, replaces global fetch. Mainly for tests; in production
   * leaving this undefined uses the platform's `fetch`.
   */
  fetch?: typeof fetch;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  /** JSON body. Mutually exclusive with `form`. */
  body?: unknown;
  /** Query string params. Nulls and undefineds are dropped. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /**
   * If truthy and no `Idempotency-Key` is set in `headers`, the SDK will
   * generate a random key and attach it. Pass a string to send a
   * caller-supplied key (e.g. one tied to a domain object).
   */
  idempotencyKey?: string | true;
  /** Extra headers. Lowercase the keys. Caller-supplied keys win. */
  headers?: Record<string, string>;
  /** Override per-request timeout. */
  timeoutMs?: number;
  /** Override retry budget for this call. */
  maxNetworkRetries?: number;
};

const DEFAULT_BASE_URL = "https://api.opensettle.io";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 3;

const RETRIABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function isLiveKey(apiKey: string): boolean {
  return apiKey.startsWith("sk_live_");
}

function isTestKey(apiKey: string): boolean {
  return apiKey.startsWith("sk_test_");
}

export function assertApiKeyEnvironment(
  apiKey: string,
  testMode: boolean | undefined,
) {
  if (!isLiveKey(apiKey) && !isTestKey(apiKey)) {
    throw new Error(
      "OpenSettle: apiKey must start with `sk_live_` or `sk_test_`",
    );
  }
  if (testMode === true && isLiveKey(apiKey)) {
    throw new Error(
      "OpenSettle: testMode is true but apiKey is sk_live_… (refusing to send live traffic)",
    );
  }
  if (testMode === false && isTestKey(apiKey)) {
    throw new Error(
      "OpenSettle: testMode is false but apiKey is sk_test_… (refusing to send to test API)",
    );
  }
}

function generateIdempotencyKey(): string {
  // Use Web Crypto if available (Node 20+, browsers, edge runtimes).
  // Fall back to a low-entropy timestamp for environments without it —
  // not cryptographically random but unique enough for retry-de-dup.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `os_${Date.now()}_${Math.floor(Math.random() * 1e12).toString(36)}`;
}

function encodeQuery(
  query: Record<string, string | number | boolean | undefined | null> | undefined,
): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === null || v === undefined) continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

function parseRetryAfter(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  // HTTP-date form (rare but legal). Convert to seconds-from-now.
  const ms = Date.parse(headerValue);
  if (!Number.isFinite(ms)) return null;
  const delta = (ms - Date.now()) / 1000;
  return delta > 0 ? delta : 0;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Capped exponential: 250ms, 500ms, 1s, 2s, 4s. */
function backoffMs(attempt: number): number {
  return Math.min(4000, 250 * 2 ** attempt);
}

export class HttpClient {
  private readonly apiKey: string;
  private readonly workspaceId: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxNetworkRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(config: ClientConfig) {
    if (!config.apiKey) {
      throw new Error("OpenSettle: apiKey is required");
    }
    if (!config.workspaceId) {
      throw new Error("OpenSettle: workspaceId is required");
    }
    assertApiKeyEnvironment(config.apiKey, config.testMode);
    this.apiKey = config.apiKey;
    this.workspaceId = config.workspaceId;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxNetworkRetries = config.maxNetworkRetries ?? DEFAULT_RETRIES;
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /**
   * Build an absolute URL. `path` may begin with `/` or not — both are
   * tolerated. `path` does NOT include `/v1/workspaces/:wsId` — that
   * prefix is owned by the SDK so resource modules read clean.
   */
  url(path: string, query?: RequestOptions["query"]): string {
    const norm = path.startsWith("/") ? path : `/${path}`;
    const ws = `/v1/workspaces/${encodeURIComponent(this.workspaceId)}`;
    return `${this.baseUrl}${ws}${norm}${encodeQuery(query)}`;
  }

  /** Build a non-workspace-scoped URL (e.g. `/v1/health`). Rare. */
  rawUrl(path: string, query?: RequestOptions["query"]): string {
    const norm = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}${norm}${encodeQuery(query)}`;
  }

  async request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.requestAt<T>(this.url(path, opts.query), opts);
  }

  async requestRaw<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.requestAt<T>(this.rawUrl(path, opts.query), opts);
  }

  private async requestAt<T>(url: string, opts: RequestOptions): Promise<T> {
    const method = opts.method ?? "GET";
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      accept: "application/json",
      "user-agent": `opensettle-node/${SDK_VERSION}`,
      ...lowercaseKeys(opts.headers),
    };

    let bodyText: string | undefined;
    if (opts.body !== undefined) {
      bodyText = JSON.stringify(opts.body);
      headers["content-type"] = "application/json";
    }

    if (opts.idempotencyKey && !headers["idempotency-key"]) {
      headers["idempotency-key"] =
        opts.idempotencyKey === true
          ? generateIdempotencyKey()
          : opts.idempotencyKey;
    }

    const timeoutMs = opts.timeoutMs ?? this.timeoutMs;
    const budget = opts.maxNetworkRetries ?? this.maxNetworkRetries;

    let lastError: OpenSettleError | null = null;
    for (let attempt = 0; attempt <= budget; attempt += 1) {
      const signal = AbortSignal.timeout(timeoutMs);
      let res: Response;
      try {
        res = await this.fetchImpl(url, {
          method,
          headers,
          body: bodyText,
          signal,
        });
      } catch (err) {
        // AbortError, DNS failure, ECONNREFUSED, etc. Retriable.
        const message = err instanceof Error ? err.message : String(err);
        lastError = new NetworkError({
          code: "network_error",
          message: `Network error: ${message}`,
          status: 0,
        });
        if (attempt < budget) {
          await delay(backoffMs(attempt));
          continue;
        }
        throw lastError;
      }

      if (res.ok) {
        // 204 No Content
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        if (!text) return undefined as T;
        try {
          return JSON.parse(text) as T;
        } catch {
          throw new APIError({
            code: "internal_error",
            message: "Server returned a 2xx with non-JSON body",
            status: res.status,
          });
        }
      }

      // Non-2xx — parse the error envelope (best effort).
      const text = await res.text();
      let envelope: { error?: { code?: string; message?: string; param?: string; request_id?: string } } | null = null;
      if (text) {
        try {
          envelope = JSON.parse(text);
        } catch {
          envelope = null;
        }
      }
      const retryAfter = parseRetryAfter(res.headers.get("retry-after"));
      const apiErr = fromEnvelope(envelope, res.status, retryAfter);

      const retriable = RETRIABLE_STATUS.has(res.status);
      if (retriable && attempt < budget) {
        const wait =
          apiErr instanceof RateLimitError && apiErr.retryAfter !== null
            ? apiErr.retryAfter * 1000
            : backoffMs(attempt);
        await delay(wait);
        lastError = apiErr;
        continue;
      }
      throw apiErr;
    }

    /* istanbul ignore next */
    throw lastError ?? new Error("Unreachable: request loop exited");
  }
}

function lowercaseKeys(
  obj: Record<string, string> | undefined,
): Record<string, string> {
  if (!obj) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k.toLowerCase()] = v;
  }
  return out;
}

/**
 * Strip the API's singleton envelope wrapper.
 *
 * The API returns most singleton responses as `{customer: {…}}`,
 * `{product: {…}}` etc. — a single-key wrapper around the resource.
 * This helper unwraps that wrapper when present, and is a no-op for:
 *
 *   - lists (no matching key, returns `{data, nextCursor, hasMore}`
 *     unchanged)
 *   - multi-key envelopes such as the refund response
 *     (`{payment, unsignedTx}`) or webhook create
 *     (`{endpoint, signingSecret}`)
 *   - `undefined` / `null` (e.g. 204 No Content)
 *
 * Used by resource modules to give callers `os.customers.create(…).id`
 * instead of `os.customers.create(…).customer.id`.
 */
export function unwrap<T>(resp: unknown, key: string): T {
  if (
    resp !== null &&
    typeof resp === "object" &&
    !Array.isArray(resp) &&
    Object.keys(resp as Record<string, unknown>).length === 1 &&
    key in (resp as Record<string, unknown>)
  ) {
    return (resp as Record<string, unknown>)[key] as T;
  }
  return resp as T;
}
