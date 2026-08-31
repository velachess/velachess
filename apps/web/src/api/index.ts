import type { AppType } from "@velachess/server";

import { DetailedError, hc, parseResponse as parseHonoResponse } from "../libs/hono.ts";
import {
  CancelledError,
  NetworkError,
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
    throw error;
  }
};

// ponytail: folded from a separate health.ts — a one-line health probe
// keeping its own file would need to import `api`/`parseResponse` back
// from this index.ts, which is exactly the cycle the index-only rule
// exists to prevent (index re-exporting a file that imports index).
export async function checkBackendHealth() {
  await parseResponse(api.health.$get());
}
