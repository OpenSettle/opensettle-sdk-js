/**
 * Typed error hierarchy for OpenSettle SDK. Mirrors the API's stable
 * `error.code` taxonomy from `@opensettle/shared/errors` (12 codes).
 *
 * Catchers can either:
 *   - check `err instanceof OpenSettleError` for the broad case, then
 *     branch on `err.code` to handle specifics, or
 *   - check the specific subclass (`InvalidRequestError`, …) when the
 *     handler only cares about that family.
 *
 * The base class always carries `requestId` so users can quote it in
 * support — this is the same `request_id` the API echoes back in every
 * error envelope.
 */

export type ErrorCode =
  | "invalid_request"
  | "invalid_state_transition"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal_error"
  | "chain_reverted"
  | "insufficient_confirmations"
  | "signing_required"
  | "aal_required"
  | "network_error";

export class OpenSettleError extends Error {
  override readonly name: string = "OpenSettleError";
  readonly code: ErrorCode;
  readonly status: number;
  readonly requestId: string | null;
  readonly param: string | null;

  constructor(opts: {
    code: ErrorCode;
    message: string;
    status: number;
    requestId?: string | null;
    param?: string | null;
  }) {
    super(opts.message);
    this.code = opts.code;
    this.status = opts.status;
    this.requestId = opts.requestId ?? null;
    this.param = opts.param ?? null;
  }
}

export class InvalidRequestError extends OpenSettleError {
  override readonly name = "InvalidRequestError";
}
export class InvalidStateTransitionError extends OpenSettleError {
  override readonly name = "InvalidStateTransitionError";
}
export class AuthenticationError extends OpenSettleError {
  override readonly name = "AuthenticationError";
}
export class ForbiddenError extends OpenSettleError {
  override readonly name = "ForbiddenError";
}
export class NotFoundError extends OpenSettleError {
  override readonly name = "NotFoundError";
}
export class ConflictError extends OpenSettleError {
  override readonly name = "ConflictError";
}

export class RateLimitError extends OpenSettleError {
  override readonly name = "RateLimitError";
  /** Seconds the API said to wait before retrying. Null if not advertised. */
  readonly retryAfter: number | null;

  constructor(opts: {
    message: string;
    status: number;
    requestId?: string | null;
    param?: string | null;
    retryAfter?: number | null;
  }) {
    super({ ...opts, code: "rate_limited" });
    this.retryAfter = opts.retryAfter ?? null;
  }
}

export class SettlementError extends OpenSettleError {
  override readonly name = "SettlementError";
}
export class StepUpRequiredError extends OpenSettleError {
  override readonly name = "StepUpRequiredError";
}
export class APIError extends OpenSettleError {
  override readonly name = "APIError";
}
export class NetworkError extends OpenSettleError {
  override readonly name = "NetworkError";
}

/**
 * Map an API error envelope (parsed JSON body) + HTTP status into the
 * right typed subclass. Falls back to APIError on unknown codes — we
 * don't want a new server-side code to crash older SDKs.
 */
export function fromEnvelope(
  envelope: { error?: { code?: string; message?: string; param?: string; request_id?: string } } | null,
  status: number,
  retryAfter: number | null,
): OpenSettleError {
  const e = envelope?.error;
  const code = (e?.code as ErrorCode | undefined) ?? "internal_error";
  const message = e?.message ?? `Request failed with status ${status}`;
  const requestId = e?.request_id ?? null;
  const param = e?.param ?? null;
  const opts = { message, status, requestId, param };

  switch (code) {
    case "invalid_request":
      return new InvalidRequestError({ ...opts, code });
    case "invalid_state_transition":
      return new InvalidStateTransitionError({ ...opts, code });
    case "unauthorized":
      return new AuthenticationError({ ...opts, code });
    case "forbidden":
      return new ForbiddenError({ ...opts, code });
    case "not_found":
      return new NotFoundError({ ...opts, code });
    case "conflict":
      return new ConflictError({ ...opts, code });
    case "rate_limited":
      return new RateLimitError({ ...opts, retryAfter });
    case "chain_reverted":
    case "insufficient_confirmations":
    case "signing_required":
      return new SettlementError({ ...opts, code });
    case "aal_required":
      return new StepUpRequiredError({ ...opts, code });
    case "internal_error":
    default:
      return new APIError({ ...opts, code: "internal_error" });
  }
}
