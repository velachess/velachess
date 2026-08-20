import { api, parseResponse, type InferResponseType } from "../../shared/api/client.ts";
import { queryOptions } from "../../shared/libs/query/index.ts";
import type { RememberedAccount } from "../import/my-accounts.ts";
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

/** Account + search both live in the cache key so switching either avoids a flash of stale rows; account may be absent (disabled query). */
export function archiveQuery(
  account: RememberedAccount | undefined,
  search: GamesSearch,
) {
  return queryOptions({
    queryKey: ["games", account?.accountId ?? "none", search],
    enabled: account !== undefined,
    queryFn: () =>
      parseResponse(
        api.games.$get({
          query: {
            platform: account!.platform,
            username: account!.username,
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
