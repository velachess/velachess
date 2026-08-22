import "@testing-library/jest-dom/vitest";

import { afterAll, afterEach, beforeAll } from "vitest";

import { resetBackendStatus } from "./src/shared/errors/backend-status.ts";
import { resetBackendRecoveryProbe } from "./src/shared/query/query-client.ts";
import { resetArchive } from "./src/test/archive.ts";
import { resetTrackedAccounts } from "./src/test/handlers/accounts.ts";
import { resetRepertoires } from "./src/test/handlers/repertoires.ts";
import { resetAuthScenario } from "./src/test/handlers/auth.ts";
import { resetDevice } from "./src/test/device.ts";
import { server } from "./src/test/server.ts";

/**
 * What every web test starts from.
 *
 * `onUnhandledRequest: "error"` is the load-bearing option: without it a
 * request nobody described falls through to the real network, where it
 * either hangs or quietly succeeds. With it, a screen that starts calling
 * a route this file doesn't know about fails immediately and by name.
 */
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });

  // jsdom has no layout, so it implements no scrolling either, and the
  // router restores scroll position on every navigation. Without this
  // stub every navigation logs a "Not implemented" error that looks like
  // a failure and is not one.
  window.scrollTo = () => {};

  // jsdom has no audio backend; failure behavior is tested through the
  // sound dispatcher's injected output instead of this browser stub.
  HTMLMediaElement.prototype.play = () => Promise.resolve();
});

/**
 * Four kinds of state outlive a test, and all of them have to go:
 * the per-test handler overrides, whether the server thinks this browser
 * is signed in, the archive the handlers answer from, and what the
 * browser remembers about its accounts. Rendered components
 * are unmounted by Testing Library's own automatic cleanup, which vitest's
 * `globals` make available to it.
 */
afterEach(() => {
  server.resetHandlers();
  resetAuthScenario();
  resetTrackedAccounts();
  resetRepertoires();
  resetBackendRecoveryProbe();
  resetBackendStatus();
  resetArchive();
  resetDevice();
});

afterAll(() => {
  server.close();
});
