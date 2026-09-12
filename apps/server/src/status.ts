/**
 * Domain status vocabularies shared across more than one file in this
 * app (route + composition, or two routes) — one named constant per
 * domain, never a single catch-all `STATUS` object. A status used by
 * exactly one file stays declared locally in that file instead of here.
 *
 * Pattern: `CONSTANT as const` → `z.enum(CONSTANT)` (Zod 4 accepts a
 * plain object's own values) → `z.infer<>` for the type. The constant is
 * what business logic compares against; the schema is only for the
 * routes that actually put this field on the wire.
 */
import { z } from "@hono/zod-openapi";

/** An analysis run's lifecycle, from request through completion — shared
 * by `GET /games/:id/analysis`, `POST /games/:id/analyze`, the SSE watch
 * loop, and the composition-root terminal mapping in
 * `composition/analysis.ts`. */
export const ANALYSIS_STATUS = {
  NOT_FOUND: "not-found",
  CREATED: "created",
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export const analysisStatusSchema = z.enum(ANALYSIS_STATUS);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;
