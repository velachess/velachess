import { DetailedError } from "../libs/hono.ts";

export interface ApiErrorOptions {
  cause?: unknown;
}

export class ApiError extends Error {
  constructor(message = "API request failed", options: ApiErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
  }
}

export class NetworkError extends ApiError {}

export class CancelledError extends ApiError {}

export class InvalidResponseError extends ApiError {}

export class UnauthorizedError extends ApiError {}

/**
 * A 429 — the server refused because a budget ran out; the request would
 * have worked otherwise.
 *
 * Its own class because it wants the opposite reaction from every other
 * failure: "something broke" invites an immediate retry, which is exactly
 * what the refusal asked not to get. `retryAfterSeconds` comes from the
 * response BODY — the server writes it there because this client cannot
 * read a rejection's headers — and is `null` when a 429 arrives without
 * one.
 */
export class RateLimitedError extends ApiError {
  readonly retryAfterSeconds: number | null;

  constructor(retryAfterSeconds: number | null, options: ApiErrorOptions = {}) {
    super("Rate limited", options);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isNetworkError(error: unknown) {
  return error instanceof NetworkError;
}

export function isCancelledError(error: unknown) {
  return error instanceof CancelledError;
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof UnauthorizedError;
}

export function isRateLimitedError(error: unknown): error is RateLimitedError {
  return error instanceof RateLimitedError;
}

/**
 * A 409 on `POST /accounts` — the caller already tracks a different handle
 * on this provider. One account per provider per user, so this is a
 * refusal to overwrite, not an infrastructure failure: the fields carry
 * the existing connection's identity so the UI can point at it instead of
 * just saying "no".
 */
export class ProviderAlreadyConnectedError extends ApiError {
  readonly platform: string;
  readonly username: string;
  readonly accountId: string;

  constructor(
    platform: string,
    username: string,
    accountId: string,
    options: ApiErrorOptions = {},
  ) {
    super("Provider already connected", options);
    this.platform = platform;
    this.username = username;
    this.accountId = accountId;
  }
}

export function isProviderAlreadyConnectedError(
  error: unknown,
): error is ProviderAlreadyConnectedError {
  return error instanceof ProviderAlreadyConnectedError;
}

export function isInvalidResponseError(error: unknown) {
  return error instanceof InvalidResponseError;
}

export function isBaseApiError(error: unknown) {
  return error instanceof ApiError && error.constructor === ApiError;
}

export function isHttpError(error: unknown) {
  return error instanceof DetailedError;
}

export function isInfrastructureError(error: unknown) {
  return (
    error instanceof NetworkError ||
    (error instanceof DetailedError &&
      typeof error.statusCode === "number" &&
      error.statusCode >= 500)
  );
}

export function isRetryableApiError(error: unknown) {
  if (isCancelledError(error)) return false;
  if (error instanceof NetworkError) return true;
  if (error instanceof DetailedError) {
    return typeof error.statusCode === "number" && error.statusCode >= 500;
  }
  return false;
}

export function normalizeApiError(error: unknown, message = "API request failed") {
  if (error instanceof ApiError || error instanceof DetailedError) return error;

  if (error instanceof DOMException && error.name === "AbortError") {
    return new CancelledError(message, { cause: error });
  }

  return new ApiError(message, { cause: error });
}
