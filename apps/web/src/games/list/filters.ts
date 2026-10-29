import { msg } from "@lingui/core/macro";

import { TIME_CLASSES } from "@velachess/chess";

import { z } from "../../libs/zod.ts";
import { GAME_SOURCE_IDS, GAME_SOURCES } from "../game-sources.ts";

/** The field caps the term natively, so a longer one never reaches a
 * `.catch()` that would drop the filter without saying so. */
export const MAX_OPPONENT_LENGTH = 64;

/** The URL owns search and filters (survives refresh/back/share); this schema is the route's `validateSearch`, so bad params default, not crash. */
export const gamesSearchSchema = z.object({
  opponent: z.string().trim().min(1).max(MAX_OPPONENT_LENGTH).optional().catch(undefined),
  color: z.enum(["white", "black"]).optional().catch(undefined),
  outcome: z.enum(["win", "loss", "draw"]).optional().catch(undefined),
  // A bare `?timeClass=blitz` is what links shared before the filter went
  // multi-select carry; both shapes land as a list.
  timeClass: z
    .union([z.enum(TIME_CLASSES), z.array(z.enum(TIME_CLASSES)).min(1)])
    .transform((chosen) => [chosen].flat())
    .optional()
    .catch(undefined),
  source: z.enum(GAME_SOURCE_IDS).optional().catch(undefined),
  page: z.number().int().min(1).default(1).catch(1),
});

export type GamesSearch = z.infer<typeof gamesSearchSchema>;
export type GameFilters = Omit<GamesSearch, "page">;

export const PAGE_SIZE = 25;

/** What the popover holds: not the page, and not the search box beside it,
 * which shows its own state. */
export function activeFilterCount(search: GamesSearch): number {
  return [search.color, search.outcome, search.source, search.timeClass?.length].filter(
    Boolean,
  ).length;
}

/** Anything typed or chosen that could explain a short list. */
export function isNarrowed(search: GamesSearch): boolean {
  return search.opponent !== undefined || activeFilterCount(search) > 0;
}

/** Every value the popover owns, back to its default, on one navigation. */
export const CLEARED_FILTERS = {
  color: undefined,
  outcome: undefined,
  timeClass: undefined,
  source: undefined,
  page: 1,
} as const satisfies Partial<GamesSearch>;

/** One value at a time: a game was played from one side with one result. */
export const CHOICE_GROUPS = [
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
    key: "color",
    label: msg`Color`,
    options: [
      { value: "white", label: msg`White` },
      { value: "black", label: msg`Black` },
    ],
  },
] as const satisfies readonly {
  key: keyof GameFilters;
  label: unknown;
  options: readonly { value: string; label: unknown }[];
}[];

/** Brand names, never translated. */
export const SOURCE_OPTIONS = GAME_SOURCE_IDS.map((value) => ({
  value,
  label: GAME_SOURCES[value].label,
}));

export const FILTERS_COPY = {
  label: msg`Filters`,
  reset: msg`Reset`,
  timeControl: msg`Time control`,
  source: msg`Source`,
  allSources: msg`All sources`,
} as const;

export const SEARCH_COPY = {
  label: msg`Search opponent`,
  placeholder: msg`Search opponent…`,
  clear: msg`Clear search`,
} as const;
