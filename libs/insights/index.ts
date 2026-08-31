/**
 * [INSIGHTS] — what this module offers the rest of the system.
 *
 * Root index.ts is the public interface of a vertical/module/capability.
 * It is not a convenience barrel. See AGENTS.md "Modules and slices" for
 * what belongs here versus what stays a private slice file.
 *
 * Aggregates across games/repertoires/analysis on its own reporting
 * cadence, rather than living on any one of those modules' endpoints —
 * see the module map for why. One slice, no cross-module or route-facing
 * surface beyond `listInsights` itself.
 */

export { listInsights } from "./get-insights/get-insights.ts";
export type { GetInsightsDeps } from "./get-insights/get-insights.ts";
