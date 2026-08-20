import { msg } from "@lingui/core/macro";

import { z } from "../../shared/libs/zod.ts";

/** The URL owns filters (survives refresh/back/share); this schema is the route's `validateSearch`, so bad params default, not crash. */
export const gamesSearchSchema = z.object({
  color: z.enum(["white", "black"]).optional().catch(undefined),
  outcome: z.enum(["win", "loss", "draw"]).optional().catch(undefined),
  timeClass: z
    .enum(["bullet", "blitz", "rapid", "classical"])
    .optional()
    .catch(undefined),
  page: z.number().int().min(1).default(1).catch(1),
});

export type GamesSearch = z.infer<typeof gamesSearchSchema>;
export type GameFilters = Omit<GamesSearch, "page">;

export const PAGE_SIZE = 25;

/** Only the narrowing ones — the page is position, not a filter. */
export function activeFilterCount(search: GamesSearch): number {
  return [search.color, search.outcome, search.timeClass].filter(Boolean).length;
}

export const FILTER_GROUPS = [
  {
    key: "color",
    label: msg`Color`,
    options: [
      { value: "white", label: msg`White` },
      { value: "black", label: msg`Black` },
    ],
  },
  {
    key: "outcome",
    label: msg`Result`,
    options: [
      { value: "win", label: msg`Win` },
      { value: "loss", label: msg`Loss` },
      { value: "draw", label: msg`Draw` },
    ],
  },
  {
    key: "timeClass",
    label: msg`Time control`,
    options: [
      { value: "bullet", label: msg`Bullet` },
      { value: "blitz", label: msg`Blitz` },
      { value: "rapid", label: msg`Rapid` },
      { value: "classical", label: msg`Classical` },
    ],
  },
] as const satisfies readonly {
  key: keyof GameFilters;
  label: unknown;
  options: readonly { value: string; label: unknown }[];
}[];

export const FILTERS_COPY = {
  trigger: msg`Filters`,
  clear: msg`Clear all`,
} as const;
