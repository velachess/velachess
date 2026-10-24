import "@testing-library/jest-dom/vitest";

import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

// Vitest 5 moved the custom-matcher augmentation point from `Assertion<T>` to
// `Matchers<R, T>` (vitest/dist/chunks/config.d.ts). jest-dom 7.0.1 still
// augments the old `Assertion<T = any>` shape, which no longer merges, so its
// matchers vanish from `expect(...)` types while still working at runtime.
// Drop this block once @testing-library/jest-dom ships a Vitest 5 augmentation.
declare module "vitest" {
  interface Matchers<
    R extends void | Promise<void> = void | Promise<void>,
    T = unknown,
  > extends TestingLibraryMatchers<unknown, R> {}
}

import { afterAll, afterEach, beforeAll } from "vitest";

import { resetBackendStatus } from "./src/backend-status/index.ts";
import { resetArchive } from "./src/test/archive.ts";
import { dropSyncStreams } from "./src/test/sync-stream.ts";
import { resetTrackedAccounts } from "./src/test/handlers/accounts.ts";
import { resetAuthScenario } from "./src/test/handlers/auth.ts";
import { resetDevice } from "./src/test/device.ts";
import { server } from "./src/test/server.ts";

/**
 * `onUnhandledFrame: "error"` is load-bearing: without it a request
 * nobody described falls through to the real network, where it hangs or
 * quietly succeeds.
 */
beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });

  // jsdom implements no scrolling, and the router restores scroll position
  // on every navigation, logging a "Not implemented" error that reads as a
  // failure.
  window.scrollTo = () => {};

  // jsdom has no audio backend; failure behavior is tested through the
  // sound dispatcher's injected output instead of this browser stub.
  HTMLMediaElement.prototype.play = () => Promise.resolve();

  // jsdom implements neither a 2D context nor toBlob, so the cropper's
  // encode cannot run. Stubbed at the platform level rather than by mocking
  // our own module, so the component still executes and the MSW handler
  // still refuses a body that is not base64.
  HTMLCanvasElement.prototype.getContext = (() => ({
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
    drawImage: () => {},
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toBlob = (callback) => {
    callback(new Blob([new Uint8Array([0x00])], { type: "image/webp" }));
  };

  // jsdom has no object URLs, and the cropper needs both halves or the
  // dialog throws before it renders.
  URL.createObjectURL = () => "blob:velachess-test";
  URL.revokeObjectURL = () => {};

  // jsdom's Image never loads, so the cropper's decode would hang; firing
  // load on the next tick lets the crop settle.
  Object.defineProperty(Image.prototype, "src", {
    set() {
      setTimeout(() => this.dispatchEvent(new Event("load")), 0);
    },
  });

  // ThemeProvider's "system" resolution reads this on every mount, and
  // jsdom implements no media queries.
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
});

afterEach(() => {
  server.resetHandlers();
  resetAuthScenario();
  resetTrackedAccounts();
  resetBackendStatus();
  resetArchive();
  dropSyncStreams();
  resetDevice();
});

afterAll(() => {
  server.close();
});
