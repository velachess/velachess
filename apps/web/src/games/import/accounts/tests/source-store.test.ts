import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SOURCE_ID } from "../sources.ts";
import { useSourceStore } from "../source-store.ts";

describe("the selected source", () => {
  beforeEach(() => {
    useSourceStore.setState({ sourceId: DEFAULT_SOURCE_ID });
  });

  it("starts on the default source", () => {
    expect(useSourceStore.getState().sourceId).toBe(DEFAULT_SOURCE_ID);
  });

  it("remembers the pick, which is the whole reason it is a store", () => {
    // Server state lives in React Query; this survives navigating away and
    // back, which local component state would not.
    useSourceStore.getState().selectSource("lichess");
    expect(useSourceStore.getState().sourceId).toBe("lichess");
  });
});
