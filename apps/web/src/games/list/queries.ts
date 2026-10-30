import { api, parseResponse, type InferResponseType } from "../../api/index.ts";
import { queryOptions } from "../../libs/react-query.ts";
import { gamesQueryKey } from "../game-query-keys.ts";
import { PAGE_SIZE, type GamesSearch } from "./filters.ts";

export type Game = InferResponseType<typeof api.games.$get, 200>["games"][number];

/** One segment, so the page is its own: the previous page's rows are a
 * fair placeholder while the next loads, the previous filter's are not. */
function narrowingKey(search: GamesSearch): string {
  return JSON.stringify([
    search.opponent ?? null,
    search.color ?? null,
    search.outcome ?? null,
    search.timeClass ?? null,
    search.source ?? null,
  ]);
}

/**
 * The user's unified library: synced accounts and manual PGN imports in
 * one list, so neither the account nor its absence gates the read.
 */
export function libraryQuery(search: GamesSearch) {
  const narrowing = narrowingKey(search);

  return queryOptions({
    queryKey: [...gamesQueryKey, narrowing, search.page],
    queryFn: ({ signal }) =>
      parseResponse(
        api.games.$get(
          {
            query: {
              ...(search.opponent ? { opponent: search.opponent } : {}),
              ...(search.color ? { color: search.color } : {}),
              ...(search.outcome ? { outcome: search.outcome } : {}),
              ...(search.timeClass?.length ? { timeClass: search.timeClass } : {}),
              ...(search.source ? { source: search.source } : {}),
              page: String(search.page),
              pageSize: String(PAGE_SIZE),
            },
          },
          { init: { signal } },
        ),
      ),
    placeholderData: (previous, previousQuery) => {
      if (previousQuery?.queryKey[1] !== narrowing) return undefined;
      return previous;
    },
  });
}
