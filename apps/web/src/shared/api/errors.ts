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

export function isNetworkError(error: unknown) {
  return error instanceof NetworkError;
}

export function isCancelledError(error: unknown) {
  return error instanceof CancelledError;
}

export function isUnauthorizedError(error: unknown) {
  return error instanceof UnauthorizedError;
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
