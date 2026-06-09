/**
 * The full set of webhook event types OpenSettle dispatches.
 *
 * Use {@link WEBHOOK_EVENTS} when subscribing an endpoint (or pass `["*"]`
 * for the wildcard) and {@link WebhookEventType} to give the `type` field on
 * a verified delivery a precise, exhaustively-switchable union:
 *
 * ```ts
 * import { verifyWebhook, WEBHOOK_EVENTS, type WebhookEventType } from "@opensettle/sdk";
 *
 * const { data } = verifyWebhook<{ type: WebhookEventType }>({ ... });
 * switch (data.type) {
 *   case "payment.confirmed": ...; break;
 *   case "subscription.renewed": ...; break;
 *   // ...the compiler flags any unhandled case
 * }
 * ```
 *
 * This list is the authoritative SDK mirror of the server's event registry
 * (`apps/api/src/services/webhook-events.ts`). It is intentionally a closed
 * set: events not listed here are not emitted. If the server adds an event,
 * append it here and add a CHANGELOG entry.
 */
export const WEBHOOK_EVENTS = [
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
  "product.created",
  "product.deleted",
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
] as const;

/** A single OpenSettle webhook event name. */
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number];

/**
 * Runtime membership test — narrows an arbitrary string to a
 * {@link WebhookEventType}. Handy when routing an inbound delivery whose
 * `type` arrives as a plain string.
 */
export function isWebhookEventType(value: string): value is WebhookEventType {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}
