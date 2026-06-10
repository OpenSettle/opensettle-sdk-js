import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhook, WebhookVerificationError } from "../src/webhooks.js";
import {
  WEBHOOK_EVENTS,
  isWebhookEventType,
  type WebhookEventType,
} from "../src/webhook-events.js";

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

describe("WEBHOOK_EVENTS", () => {
  it("is the exact closed set of 41 event names with no duplicates", () => {
    expect(WEBHOOK_EVENTS).toHaveLength(41);
    expect(new Set(WEBHOOK_EVENTS).size).toBe(41);
  });

  it("matches the authoritative registry verbatim (catches drift / typos)", () => {
    const expected = [
      "allowance.depleted",
      "checkout.created",
      "checkout.expired",
      "checkout.succeeded",
      "customer.created",
      "customer.deleted",
      "customer.updated",
      "invoice.created",
      "invoice.paid",
      "invoice.past_due",
      "invoice.reminder_sent",
      "invoice.sent",
      "invoice.voided",
      "payment.confirmed",
      "payment.failed",
      "payment.pending",
      "payment.refunded",
      "payment.reorg_suspected",
      "payment.reorged",
      "payment.reversed",
      "price.created",
      "price.updated",
      "product.created",
      "product.updated",
      "refund.broadcast",
      "refund.confirmed",
      "refund.initiated",
      "subscription.canceled",
      "subscription.created",
      "subscription.past_due",
      "subscription.paused",
      "subscription.payment_failed",
      "subscription.plan_changed",
      "subscription.renewed",
      "subscription.resumed",
      "subscription.trial_ended",
      "wallet.connected",
      "wallet.removed",
      "wallet.verified",
      "webhook.endpoint.created",
      "webhook.endpoint.test",
    ];
    expect([...WEBHOOK_EVENTS].sort()).toStrictEqual([...expected].sort());
  });

  it("does NOT contain the hallucinated events a prior audit invented", () => {
    // NOTE: webhook.endpoint.test was a phantom in a prior audit but is now a
    // REAL emitted event (events.ts emitEvent({ type: "webhook.endpoint.test" })),
    // so it is intentionally absent from this list.
    const phantom = ["payment.screened", "allowance.recorded", "allowance.revoked"];
    for (const p of phantom) {
      expect(WEBHOOK_EVENTS as readonly string[]).not.toContain(p);
    }
  });

  it("isWebhookEventType narrows known strings and rejects unknown ones", () => {
    expect(isWebhookEventType("payment.confirmed")).toBe(true);
    expect(isWebhookEventType("nope.not.real")).toBe(false);
    const raw = "subscription.renewed";
    if (isWebhookEventType(raw)) {
      const narrowed: WebhookEventType = raw; // compile-time: narrowed to the union
      expect(narrowed).toBe("subscription.renewed");
    } else {
      throw new Error("expected subscription.renewed to be a known event");
    }
  });
});
