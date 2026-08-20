import { create } from "zustand";

import { DEFAULT_SOURCE_ID, type SourceId } from "./sources.ts";

interface SourceStore {
  sourceId: SourceId;
  selectSource: (sourceId: SourceId) => void;
}

export const useSourceStore = create<SourceStore>((set) => ({
  sourceId: DEFAULT_SOURCE_ID,
  selectSource: (sourceId) => set({ sourceId }),
}));
