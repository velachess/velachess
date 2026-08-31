import { api, parseResponse, type InferResponseType } from "../api/index.ts";
import { queryOptions } from "../libs/react-query.ts";

type InsightsReport = InferResponseType<typeof api.insights.$get, 200>;

export type Finding = InsightsReport["findings"][number];

export const insightsQuery = queryOptions({
  queryKey: ["insights"],
  queryFn: () => parseResponse(api.insights.$get()),
});
