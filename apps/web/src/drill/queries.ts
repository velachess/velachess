import { z } from "../libs/zod.ts";
import { api, parseResponse, type InferResponseType } from "../api/index.ts";
import { queryOptions } from "../libs/react-query.ts";

export type DrillQueue = InferResponseType<typeof api.drill.queue.$get, 200>;
export type DrillItem = InferResponseType<typeof api.drill.next.$get, 200>;
export type DrillAnswer = InferResponseType<typeof api.drill.answer.$post, 200>;

/**
 * The slice of the queue this screen was asked for, carried in the URL:
 * a chapter's Train button and an insight's CTA both land on /drill with
 * the scope in the search params, so the narrowed session survives a
 * refresh and a shared link. `.catch(undefined)` per field — hand-typed
 * garbage falls back to the whole queue instead of crashing the route.
 */
export const drillSearchSchema = z.object({
  repertoire: z.string().uuid().optional().catch(undefined),
  chapter: z.string().uuid().optional().catch(undefined),
  source: z
    .enum(["repertoire-deviation", "engine-blunder", "repertoire-line"])
    .optional()
    .catch(undefined),
});

export type DrillScopeSearch = z.infer<typeof drillSearchSchema>;

function scopeQuery(scope: DrillScopeSearch) {
  return {
    ...(scope.repertoire ? { repertoire: scope.repertoire } : {}),
    ...(scope.chapter ? { chapter: scope.chapter } : {}),
    ...(scope.source ? { source: scope.source } : {}),
  };
}

export function drillQueueQuery(scope: DrillScopeSearch = {}) {
  return queryOptions({
    queryKey: ["drill", "queue", scopeQuery(scope)],
    queryFn: () => parseResponse(api.drill.queue.$get({ query: scopeQuery(scope) })),
  });
}

/**
 * The next position, or null when there is nothing waiting.
 *
 * 204 is the "nothing due" answer and it carries no body, so parsing it
 * as JSON would throw on an outcome that is not an error. `staleTime: 0`
 * because answering one changes what the next one is.
 */
export function drillNextQuery(scope: DrillScopeSearch = {}) {
  return queryOptions({
    queryKey: ["drill", "next", scopeQuery(scope)],
    staleTime: 0,
    queryFn: async () =>
      (await parseResponse(api.drill.next.$get({ query: scopeQuery(scope) }))) ?? null,
  });
}
