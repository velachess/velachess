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

  layOutPanelGroups();

  // jsdom has no Web Animations API. Base UI's scroll area calls it once a
  // ResizeObserver reports; everything else in Base UI skips animation
  // waits under its own flag, as it did when the API was simply missing.
  Element.prototype.getAnimations = () => [];
  Object.assign(globalThis, { BASE_UI_ANIMATIONS_DISABLED: true });

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

/**
 * jsdom lays nothing out, and react-resizable-panels measures its panels and
 * hit-tests its separators. Laid out on a desktop-wide frame by each panel's
 * flex-grow, the way the browser does, a synthetic pointer at (0, 0) lands on
 * the sidebar instead of on a zero-sized separator, and collapsing has a
 * width to collapse from.
 */
const FRAME = { width: 1440, height: 900 };

function flexGrow(element: Element) {
  if (!(element instanceof HTMLElement)) return 0;
  return Number(element.style.flexGrow) || 1;
}

function panelWidth(panel: Element) {
  const panels = Array.from(panel.parentElement?.children ?? []).filter((child) =>
    child.hasAttribute("data-panel"),
  );
  const total = panels.reduce((sum, each) => sum + flexGrow(each), 0);
  return (FRAME.width * flexGrow(panel)) / total;
}

function leftOf(element: Element) {
  let left = 0;
  for (const sibling of Array.from(element.parentElement?.children ?? [])) {
    if (sibling === element) return left;
    if (sibling.hasAttribute("data-panel")) left += panelWidth(sibling);
  }
  return left;
}

function resizeEntry(target: Element): ResizeObserverEntry {
  const contentRect = target.getBoundingClientRect();
  const size = [{ inlineSize: contentRect.width, blockSize: contentRect.height }];
  return {
    target,
    contentRect,
    borderBoxSize: size,
    contentBoxSize: size,
    devicePixelContentBoxSize: size,
  };
}

/** Sizes only change through inline styles here, so a style mutation is when
 * a ResizeObserver would fire. */
class StyleResizeObserver {
  #callback: ResizeObserverCallback;
  #mutations = new MutationObserver((records) =>
    this.#notify(
      records.flatMap((record) =>
        record.target instanceof Element ? [record.target] : [],
      ),
    ),
  );

  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }

  observe(target: Element) {
    this.#mutations.observe(target, { attributes: true, attributeFilter: ["style"] });
    queueMicrotask(() => this.#notify([target]));
  }

  unobserve() {}

  disconnect() {
    this.#mutations.disconnect();
  }

  #notify(targets: Element[]) {
    this.#callback(targets.map(resizeEntry), this);
  }
}

function layOutPanelGroups() {
  globalThis.ResizeObserver = StyleResizeObserver;

  const getBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute("data-panel") ? panelWidth(this) : 0;
    },
  });
  HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
    if (this.hasAttribute("data-group"))
      return new DOMRect(0, 0, FRAME.width, FRAME.height);
    if (this.hasAttribute("data-panel"))
      return new DOMRect(leftOf(this), 0, panelWidth(this), FRAME.height);
    if (this.hasAttribute("data-separator"))
      return new DOMRect(leftOf(this), 0, 1, FRAME.height);
    return getBoundingClientRect.call(this);
  };
}
