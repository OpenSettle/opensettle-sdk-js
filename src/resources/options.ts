/**
 * Optional per-call options that every state-mutating resource method
 * accepts as its trailing argument.
 *
 * Currently exposes a single field — `idempotencyKey` — that lets
 * callers tie the request's `Idempotency-Key` header to a domain object
 * they already own (an order ID, a checkout session row's primary key,
 * etc.). When omitted, the SDK auto-generates a random key per call.
 *
 * The shape is split into its own module so resource files can import a
 * single canonical type instead of redeclaring the option bag.
 */
export type ResourceCallOpts = {
  /**
   * Caller-supplied `Idempotency-Key` header value. Tie this to a domain
   * object so retries from your own systems collide on the same key
   * (which is what keeps the operation safe). Must be ≤ 255 chars per
   * the API contract.
   */
  idempotencyKey?: string;
};
