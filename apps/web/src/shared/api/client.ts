import type { AppType } from "@velachess/server";

import { DetailedError, hc, parseResponse as parseHonoResponse } from "../libs/hono.ts";
import { CancelledError, NetworkError, UnauthorizedError } from "./errors.ts";

export { DetailedError } from "../libs/hono.ts";
export type { InferResponseType } from "../libs/hono.ts";

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

export const parseResponse: typeof parseHonoResponse = async (...args) => {
  try {
    return await parseHonoResponse(...args);
  } catch (error) {
    if (error instanceof DetailedError && error.statusCode === 401) {
      throw new UnauthorizedError("Unauthorized", { cause: error });
    }
    throw error;
  }
};
