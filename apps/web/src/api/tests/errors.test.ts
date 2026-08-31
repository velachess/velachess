import { afterEach, describe, expect, it, vi } from "vitest";

import { api, DetailedError, parseResponse } from "../index.ts";
import {
  ApiError,
  CancelledError,
  InvalidResponseError,
  NetworkError,
  isCancelledError,
  isHttpError,
  isInfrastructureError,
  isInvalidResponseError,
  isNetworkError,
  normalizeApiError,
} from "../errors.ts";

describe("API error classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes Hono fetch boundary TypeErrors as network errors", async () => {
    const cause = new TypeError("Failed to fetch");

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(cause)),
    );

    await expect(parseResponse(api.health.$get())).rejects.toMatchObject({
      cause,
      name: "NetworkError",
    });
  });

  it("does not normalize arbitrary TypeErrors as network errors", () => {
    const cause = new TypeError("programming bug");
    const error = normalizeApiError(cause, "load failed");

    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(NetworkError);
    expect(error.cause).toBe(cause);
    expect(isNetworkError(error)).toBe(false);
    expect(isInfrastructureError(error)).toBe(false);
  });

  it("normalizes unexpected failures to the base API error", () => {
    const cause = new Error("programming bug");
    const error = normalizeApiError(cause, "load failed");

    expect(error).toBeInstanceOf(ApiError);
    expect(error).not.toBeInstanceOf(NetworkError);
    expect(error.cause).toBe(cause);
    expect(isInfrastructureError(error)).toBe(false);
  });

  it("keeps cancellations distinct from infrastructure failures", () => {
    const error = normalizeApiError(
      new DOMException("cancelled", "AbortError"),
      "load failed",
    );

    expect(error).toBeInstanceOf(CancelledError);
    expect(isCancelledError(error)).toBe(true);
    expect(isInfrastructureError(error)).toBe(false);
  });

  it.each([500, 502, 503, 504])(
    "keeps Hono DetailedError %i as the HTTP error and classifies it as infrastructure",
    (status) => {
      const error = new DetailedError(`${status}`, { statusCode: status });

      expect(isHttpError(error)).toBe(true);
      expect(isInfrastructureError(error)).toBe(true);
    },
  );

  it.each([403, 404])("does not classify HTTP %i as infrastructure", (status) => {
    const error = new DetailedError(`${status}`, { statusCode: status });

    expect(isHttpError(error)).toBe(true);
    expect(isInfrastructureError(error)).toBe(false);
  });

  it("keeps invalid responses separate from network and HTTP failures", () => {
    const cause = new Error("bad shape");
    const error = new InvalidResponseError("load failed", { cause });

    expect(error).toBeInstanceOf(InvalidResponseError);
    expect(error.cause).toBe(cause);
    expect(isInvalidResponseError(error)).toBe(true);
    expect(isInfrastructureError(error)).toBe(false);
  });
});
