import { create } from "zustand";
import { persist } from "zustand/middleware";

import { SIDEBAR_WIDTH } from "@velachess/ui/lib/sidebar-width";

interface SidebarStore {
  open: boolean;
  /** The expanded width, kept while collapsed so expanding restores it. */
  width: number;
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
}

const SIDEBAR_STORAGE_KEY = "velachess.sidebar";

export const useSidebarStore = create<SidebarStore>()(
  persist(
    (set) => ({
      open: true,
      width: SIDEBAR_WIDTH.default,
      setOpen: (open) => set({ open }),
      setWidth: (width) => set({ width }),
    }),
    { name: SIDEBAR_STORAGE_KEY, version: 1 },
  ),
);
