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

/** Both server throttles put `retryAfterSeconds` in the body: this client
 * sees a rejection's body, never its `Retry-After` header. */
function retryAfterOf(error: DetailedError): number | null {
  const data: unknown = error.detail?.data;
  if (
    typeof data === "object" &&
    data !== null &&
    "retryAfterSeconds" in data &&
    typeof data.retryAfterSeconds === "number"
  ) {
    return data.retryAfterSeconds;
  }
  return null;
}

function providerConflictOf(
  error: DetailedError,
): { platform: string; username: string; accountId: string } | null {
  const data: unknown = error.detail?.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("platform" in data) ||
    !("username" in data) ||
    !("accountId" in data) ||
    typeof data.platform !== "string" ||
    typeof data.username !== "string" ||
    typeof data.accountId !== "string"
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
