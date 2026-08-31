import { api, parseResponse, type InferResponseType } from "../api/index.ts";
import { queryOptions } from "../libs/react-query.ts";

export type Overview = InferResponseType<typeof api.overview.$get, 200>;

export const overviewQuery = queryOptions({
  queryKey: ["overview"],
  queryFn: () => parseResponse(api.overview.$get()),
});
