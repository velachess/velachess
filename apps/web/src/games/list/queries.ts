import { api, parseResponse, type InferResponseType } from "../../api/index.ts";
import { queryOptions } from "../../libs/react-query.ts";
import { PAGE_SIZE, type GamesSearch } from "./filters.ts";

type GameRow = InferResponseType<typeof api.games.$get, 200>["games"][number];

export type Game = Pick<
  GameRow,
  | "id"
  | "whiteName"
  | "whiteRating"
  | "blackName"
  | "blackRating"
  | "result"
  | "playedAt"
  | "perspective"
  | "source"
  | "externalUrl"
  | "timeControlInitialSeconds"
  | "timeControlIncrementSeconds"
  | "openingName"
>;

/**
 * The user's unified library: synced accounts and manual PGN imports in
 * one list, so neither the account nor its absence gates the read.
 * Search lives in the cache key so changing a filter avoids a flash of
 * stale rows.
 */
export function libraryQuery(search: GamesSearch) {
  return queryOptions({
    queryKey: ["games", search],
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
