/**
 * Polling helpers for waiting on resource state transitions. Webhooks
 * are the right tool for production, but in scripts, CI, and tests
 * it's useful to block until a payment confirms or a subscription
 * transitions. `waitFor` polls `.retrieve()` at a fixed interval and
 * resolves when the predicate is satisfied — or rejects with
 * `WaitTimeoutError` once the timeout elapses.
 *
 * @example
 *   const payment = await waitFor(
 *     (id) => os.payments.retrieve(id),
 *     "pay_…",
 *     (p) => p.status === "confirmed",
 *     { timeoutMs: 120_000, intervalMs: 2_000 },
 *   );
 */

export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_INTERVAL_MS = 2_000;

export class WaitTimeoutError extends Error {
  override readonly name = "WaitTimeoutError";
  /** The last-observed resource — useful for debugging what state it was in. */
  readonly last: unknown;

  constructor(message: string, last: unknown) {
    super(message);
    this.last = last;
  }
}

export type WaitForOptions = {
  /** Hard timeout, ms. Default 120_000 (2 min). */
  timeoutMs?: number;
  /** Poll interval, ms. Default 2_000 (2s). */
  intervalMs?: number;
  /** Override sleep (mainly for tests). */
  sleep?: (ms: number) => Promise<void>;
  /** Override clock (mainly for tests). */
  now?: () => number;
};

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function waitFor<T>(
  retrieve: (id: string) => Promise<T>,
  resourceId: string,
  until: (resource: T) => boolean,
  opts: WaitForOptions = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;

  const deadline = now() + timeoutMs;
  let last: T | undefined;
  while (true) {
    last = await retrieve(resourceId);
    if (until(last)) return last;
    if (now() >= deadline) {
      throw new WaitTimeoutError(
        `${resourceId} did not reach target state within ${timeoutMs}ms`,
        last,
      );
    }
    await sleep(intervalMs);
  }
}
