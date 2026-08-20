import { api, parseResponse, type InferResponseType } from "../shared/api/client.ts";
import { queryOptions } from "../shared/libs/query/index.ts";

type InsightsReport = InferResponseType<typeof api.insights.$get, 200>;

export type Finding = InsightsReport["findings"][number];

export const insightsQuery = queryOptions({
  queryKey: ["insights"],
  queryFn: () => parseResponse(api.insights.$get()),
});
