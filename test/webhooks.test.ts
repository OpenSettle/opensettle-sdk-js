import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhook, WebhookVerificationError } from "../src/webhooks.js";

const SECRET = "whsec_test_0123456789abcdef";

function sign(secret: string, body: string, t: number): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

describe("verifyWebhook", () => {
  const body = JSON.stringify({ id: "evt_1", type: "payment.confirmed" });
  const now = 1_777_000_000;

  it("accepts a valid signature", () => {
    const r = verifyWebhook<{ id: string }>({
      rawBody: body,
      signatureHeader: sign(SECRET, body, now),
      secret: SECRET,
      now,
    });
    expect(r.timestamp).toBe(now);
    expect(r.data.id).toBe("evt_1");
  });

  it("ignores unknown signature-header keys (forward-compat for v2)", () => {
    const v1 = createHmac("sha256", SECRET).update(`${now}.${body}`).digest("hex");
    const r = verifyWebhook({
      rawBody: body,
      signatureHeader: `t=${now},v1=${v1},v2=futurevalue`,
      secret: SECRET,
      now,
    });
    expect(r.timestamp).toBe(now);
  });

  it("accepts headers with whitespace around segments", () => {
    const v1 = createHmac("sha256", SECRET).update(`${now}.${body}`).digest("hex");
    const r = verifyWebhook({
      rawBody: body,
      signatureHeader: ` t=${now} ,  v1=${v1}  `,
      secret: SECRET,
      now,
    });
    expect(r.timestamp).toBe(now);
  });

  it("rejects missing header", () => {
    expect(() =>
      verifyWebhook({
        rawBody: body,
        signatureHeader: null,
        secret: SECRET,
      }),
    ).toThrowError(
      expect.objectContaining({ reason: "missing_header" }),
    );
  });

  it("rejects malformed header (no v1)", () => {
    expect(() =>
      verifyWebhook({
        rawBody: body,
        signatureHeader: `t=${now}`,
        secret: SECRET,
        now,
      }),
    ).toThrowError(
      expect.objectContaining({ reason: "malformed_header" }),
    );
  });

  it("rejects malformed header (non-numeric t)", () => {
    expect(() =>
      verifyWebhook({
        rawBody: body,
        signatureHeader: `t=abc,v1=ff`,
        secret: SECRET,
        now,
      }),
    ).toThrowError(
      expect.objectContaining({ reason: "malformed_header" }),
    );
  });

  it("rejects malformed header (non-hex v1)", () => {
    expect(() =>
      verifyWebhook({
        rawBody: body,
        signatureHeader: `t=${now},v1=ZZZZ`,
        secret: SECRET,
        now,
      }),
    ).toThrowError(
      expect.objectContaining({ reason: "malformed_header" }),
    );
  });

  it("rejects stale timestamp outside tolerance", () => {
    const old = now - 600; // 10min ago, default tolerance is 5min
    expect(() =>
      verifyWebhook({
        rawBody: body,
        signatureHeader: sign(SECRET, body, old),
        secret: SECRET,
        now,
      }),
    ).toThrowError(
      expect.objectContaining({ reason: "stale_timestamp" }),
    );
  });

  it("respects a custom tolerance", () => {
    const old = now - 600;
    const r = verifyWebhook({
      rawBody: body,
      signatureHeader: sign(SECRET, body, old),
      secret: SECRET,
      now,
      tolerance: 3600,
    });
    expect(r.timestamp).toBe(old);
  });

  it("disables timestamp checks when tolerance is 0", () => {
    const ancient = now - 86400 * 365;
    const r = verifyWebhook({
      rawBody: body,
      signatureHeader: sign(SECRET, body, ancient),
      secret: SECRET,
      now,
      tolerance: 0,
    });
    expect(r.timestamp).toBe(ancient);
  });

  it("rejects tampered body", () => {
    const tampered = body + "X";
    expect(() =>
      verifyWebhook({
        rawBody: tampered,
        signatureHeader: sign(SECRET, body, now),
        secret: SECRET,
        now,
      }),
    ).toThrowError(
      expect.objectContaining({ reason: "signature_mismatch" }),
    );
  });

  it("rejects wrong secret", () => {
    expect(() =>
      verifyWebhook({
        rawBody: body,
        signatureHeader: sign(SECRET, body, now),
        secret: "whsec_other",
        now,
      }),
    ).toThrowError(
      expect.objectContaining({ reason: "signature_mismatch" }),
    );
  });

  it("rejects body that's not valid JSON (after sig passes)", () => {
    const garbage = "not json {";
    expect(() =>
      verifyWebhook({
        rawBody: garbage,
        signatureHeader: sign(SECRET, garbage, now),
        secret: SECRET,
        now,
      }),
    ).toThrowError(
      expect.objectContaining({ reason: "invalid_body" }),
    );
  });

  it("WebhookVerificationError exposes a typed reason", () => {
    let caught: WebhookVerificationError | null = null;
    try {
      verifyWebhook({
        rawBody: body,
        signatureHeader: null,
        secret: SECRET,
      });
    } catch (e) {
      caught = e as WebhookVerificationError;
    }
    expect(caught).toBeInstanceOf(WebhookVerificationError);
    expect(caught!.reason).toBe("missing_header");
  });
});
