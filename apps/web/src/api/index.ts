import type { AppType } from "@velachess/server";

import { DetailedError, hc, parseResponse as parseHonoResponse } from "../libs/hono.ts";
import {
  CancelledError,
  NetworkError,
  ProviderAlreadyConnectedError,
  RateLimitedError,
  UnauthorizedError,
} from "./errors.ts";

export { DetailedError } from "../libs/hono.ts";
export type { InferResponseType } from "../libs/hono.ts";
export * from "./errors.ts";
export { onUnauthorized, reportUnauthorized } from "./unauthorized.ts";

export const apiBaseUrl = "/api";

const apiFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new CancelledError("API request cancelled", { cause: error });
    }

    if (error instanceof TypeError) {
      throw new NetworkError("Network request failed", { cause: error });
    }

    throw error;
  }
};

export const api = hc<AppType>(apiBaseUrl, { fetch: apiFetch });

/**
 * The wait a 429 body carries, when it carries one. Both throttles on the
 * server — the rate-limit middleware and the sync cooldown — write
 * `retryAfterSeconds` into the body, precisely because this client can
 * only see a rejection's body, never its `Retry-After` header.
 */
function retryAfterOf(error: DetailedError): number | null {
  const data = error.detail?.data as { retryAfterSeconds?: unknown } | undefined;
  return typeof data?.retryAfterSeconds === "number" ? data.retryAfterSeconds : null;
}

/** The existing-connection identity a 409 on `POST /accounts` carries, or
 * `null` if the body didn't have the expected shape. */
function providerConflictOf(
  error: DetailedError,
): { platform: string; username: string; accountId: string } | null {
  const data = error.detail?.data as
    | { platform?: unknown; username?: unknown; accountId?: unknown }
    | undefined;
  if (
    typeof data?.platform !== "string" ||
    typeof data?.username !== "string" ||
    typeof data?.accountId !== "string"
  ) {
    return null;
  }
  return { platform: data.platform, username: data.username, accountId: data.accountId };
}

export const parseResponse: typeof parseHonoResponse = async (...args) => {
  try {
    return await parseHonoResponse(...args);
  } catch (error) {
    if (error instanceof DetailedError && error.statusCode === 401) {
      throw new UnauthorizedError("Unauthorized", { cause: error });
    }
    if (error instanceof DetailedError && error.statusCode === 429) {
      throw new RateLimitedError(retryAfterOf(error), { cause: error });
    }
    if (error instanceof DetailedError && error.statusCode === 409) {
      const conflict = providerConflictOf(error);
      if (conflict) {
        throw new ProviderAlreadyConnectedError(
          conflict.platform,
          conflict.username,
          conflict.accountId,
          { cause: error },
        );
      }
    }
    throw error;
  }
};
