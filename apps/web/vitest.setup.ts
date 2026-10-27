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

import { SIDEBAR_MEDIA_QUERY } from "@velachess/ui/lib/sidebar";

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

  // jsdom implements no scrolling, and the router restores it on every
  // navigation.
  window.scrollTo = () => {};

  // jsdom has no audio backend.
  HTMLMediaElement.prototype.play = () => Promise.resolve();

  // jsdom implements neither a 2D context nor toBlob, which the cropper's
  // encode needs.
  // oxlint-disable-next-line typescript/consistent-type-assertions -- getContext is overloaded per context id, and a 2D stub cannot satisfy the other overloads' return types
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

  // jsdom implements no media queries; tests run on a desktop viewport.
  window.matchMedia = (query: string) => ({
    matches: query === SIDEBAR_MEDIA_QUERY,
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
