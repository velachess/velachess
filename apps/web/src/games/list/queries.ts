import { api, parseResponse, type InferResponseType } from "../../api/index.ts";
import { queryOptions } from "../../libs/react-query.ts";
import { gamesQueryKey } from "../game-query-keys.ts";
import { PAGE_SIZE, type GamesSearch } from "./filters.ts";

export type Game = InferResponseType<typeof api.games.$get, 200>["games"][number];

/**
 * The user's unified library: synced accounts and manual PGN imports in
 * one list, so neither the account nor its absence gates the read.
 * Search lives in the cache key so changing a filter avoids a flash of
 * stale rows.
 */
export function libraryQuery(search: GamesSearch) {
  return queryOptions({
    queryKey: [...gamesQueryKey, search],
    queryFn: () =>
      parseResponse(
        api.games.$get({
          query: {
            ...(search.color ? { color: search.color } : {}),
            ...(search.outcome ? { outcome: search.outcome } : {}),
            ...(search.timeClass ? { timeClass: search.timeClass } : {}),
            page: String(search.page),
            pageSize: String(PAGE_SIZE),
          },
        }),
      ),
    placeholderData: (previous) => previous,
  });
}
