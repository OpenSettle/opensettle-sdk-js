import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a signed OpenSettle webhook delivery. The signing scheme matches
 * `apps/api/src/services/webhook-deliver.ts::signPayload` exactly:
 *
 *   header  : `x-opensettle-signature: t=<unix>,v1=<hex_hmac_sha256>`
 *   message : `${unix_seconds}.${raw_body}`
 *   secret  : the per-endpoint signing secret returned by
 *             `POST /v1/workspaces/:ws/webhook_endpoints` (or rotated via
 *             `…/webhook_endpoints/:id/rotate`)
 *
 * The verifier is constant-time. It throws `WebhookVerificationError`
 * with a specific reason on every failure path so handlers can return a
 * 400 with confidence — the caller already knows the request didn't come
 * from us.
 *
 * Pass `tolerance` (seconds) to reject deliveries whose timestamp is too
 * old. Default is 300s (5 min); set 0 to disable timestamp checking
 * entirely (NOT recommended outside replay-driven tests).
 */

export type VerifiedWebhook<T = unknown> = {
  /** The decoded JSON body. */
  data: T;
  /** Unix timestamp from the signature header. */
  timestamp: number;
};

export class WebhookVerificationError extends Error {
  override readonly name = "WebhookVerificationError";
  readonly reason:
    | "missing_header"
    | "malformed_header"
    | "stale_timestamp"
    | "signature_mismatch"
    | "invalid_body";

  constructor(message: string, reason: WebhookVerificationError["reason"]) {
    super(message);
    this.reason = reason;
  }
}

const DEFAULT_TOLERANCE_SECONDS = 300;

export class WebhookSecretError extends Error {
  override readonly name = "WebhookSecretError";
}

export function verifyWebhook<T = unknown>(opts: {
  /**
   * The exact bytes of the request body. Accepts a `string`, `Buffer`,
   * or `Uint8Array` so frameworks that hand back binary payloads (e.g.
   * `express.raw()`) work without an extra `toString()` step. Strings
   * are encoded as UTF-8 to match what the API signed against.
   */
  rawBody: string | Buffer | Uint8Array;
  /** The `x-opensettle-signature` header value. */
  signatureHeader: string | null | undefined;
  /** The endpoint's signing secret. Must be non-empty. */
  secret: string;
  /** Tolerance window for the timestamp, in seconds. Defaults to 300s. */
  tolerance?: number;
  /** Override "now" (epoch seconds). Mainly for tests. */
  now?: number;
}): VerifiedWebhook<T> {
  if (typeof opts.secret !== "string" || opts.secret.length === 0) {
    throw new WebhookSecretError(
      "verifyWebhook requires a non-empty `secret`. Pass the per-endpoint signing secret returned when the webhook endpoint was created or rotated.",
    );
  }

  if (!opts.signatureHeader) {
    throw new WebhookVerificationError(
      "Missing x-opensettle-signature header",
      "missing_header",
    );
  }

  const parsed = parseSignatureHeader(opts.signatureHeader);
  if (!parsed) {
    throw new WebhookVerificationError(
      "Malformed signature header",
      "malformed_header",
    );
  }
  const { timestamp, v1 } = parsed;

  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE_SECONDS;
  if (tolerance > 0) {
    const now = opts.now ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > tolerance) {
      throw new WebhookVerificationError(
        `Timestamp ${timestamp} is outside the ${tolerance}s tolerance window (now=${now})`,
        "stale_timestamp",
      );
    }
  }

  const bodyBuf = toBytes(opts.rawBody);
  const tsBuf = Buffer.from(`${timestamp}.`, "utf8");
  const expected = createHmac("sha256", opts.secret)
    .update(tsBuf)
    .update(bodyBuf)
    .digest("hex");

  // Constant-time compare requires equal-length buffers — bail early on
  // length mismatch before timingSafeEqual.
  if (expected.length !== v1.length) {
    throw new WebhookVerificationError(
      "Signature mismatch",
      "signature_mismatch",
    );
  }
  const ok = timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(v1, "utf8"));
  if (!ok) {
    throw new WebhookVerificationError(
      "Signature mismatch",
      "signature_mismatch",
    );
  }

  let data: T;
  try {
    data = JSON.parse(bodyBuf.toString("utf8")) as T;
  } catch {
    throw new WebhookVerificationError(
      "Body is not valid JSON",
      "invalid_body",
    );
  }
  return { data, timestamp };
}

function toBytes(input: string | Buffer | Uint8Array): Buffer {
  if (typeof input === "string") return Buffer.from(input, "utf8");
  if (Buffer.isBuffer(input)) return input;
  return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

function parseSignatureHeader(
  header: string,
): { timestamp: number; v1: string } | null {
  // Format: "t=<unix>,v1=<hex>" — order-independent, comma-separated KV.
  const parts = header.split(",").map((p) => p.trim()).filter(Boolean);
  let timestamp: number | null = null;
  let v1: string | null = null;
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq <= 0) return null;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      const n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
      timestamp = n;
    } else if (key === "v1") {
      if (!/^[0-9a-f]+$/i.test(value)) return null;
      v1 = value;
    }
    // Unknown keys are ignored (forward-compat for v2 signatures).
  }
  if (timestamp === null || v1 === null) return null;
  return { timestamp, v1 };
}
