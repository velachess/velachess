import { api, parseResponse, type InferResponseType } from "../shared/api/client.ts";
import { queryOptions } from "../shared/libs/query/index.ts";

export type Overview = InferResponseType<typeof api.overview.$get, 200>;

export const overviewQuery = queryOptions({
  queryKey: ["overview"],
  queryFn: () => parseResponse(api.overview.$get()),
});
