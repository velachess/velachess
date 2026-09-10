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

class IntersectionObserverStub implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "0px";
  readonly scrollMargin = "0px";
  readonly thresholds = [];

  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
}

globalThis.IntersectionObserver = IntersectionObserverStub;
