import { api, parseResponse, type InferResponseType } from "../shared/api/client.ts";
import { queryOptions } from "../shared/libs/query/index.ts";
import { z } from "../shared/libs/zod.ts";

/** Practising a repertoire, optionally narrowed to one chapter. */
export const practiceSearchSchema = z.object({
  chapter: z.string().uuid().optional().catch(undefined),
});

/**
 * `GET /repertoires` — every book with its adherence, chapter count,
 * gaps and slice of the training queue. The landing reads this once and
 * derives the two fixed areas (White, Black) from `color`; the server
 * may hold more rows, but the product's top level is the pair.
 */
export type RepertoireSummary = InferResponseType<
  typeof api.repertoires.$get,
  200
>[number];

export const repertoiresQuery = queryOptions({
  queryKey: ["repertoires"],
  queryFn: () => parseResponse(api.repertoires.$get()),
});

/** `GET /repertoires/:id` — header, chapter rows (no PGN), statistics. */
type RepertoireDetail = InferResponseType<(typeof api.repertoires)[":id"]["$get"], 200>;
export type ChapterRow = RepertoireDetail["chapters"][number];
/** The book as its own screen holds it — header, chapters, statistics. */
export type RepertoireBook = RepertoireDetail;

export function repertoireQuery(repertoireId: string) {
  return queryOptions({
    queryKey: ["repertoires", repertoireId],
    queryFn: () =>
      parseResponse(api.repertoires[":id"].$get({ param: { id: repertoireId } })),
  });
}

/** `GET /repertoires/:repertoireId/chapters/:chapterId` — the heavy one:
 * tree, decision positions, root key. Fetched when a chapter opens. */
export type ChapterDetail = InferResponseType<
  (typeof api.repertoires)[":repertoireId"]["chapters"][":chapterId"]["$get"],
  200
>;
type ChapterLine = ChapterDetail["lines"][number];
export type ChapterMove = ChapterLine["moves"][number];
/** Where a move sits — the server's coordinate, used as the screen's
 * whole navigation state. */
export type MoveCursor = ChapterMove["prepared"][number]["at"];

export function chapterQuery(repertoireId: string, chapterId: string) {
  return queryOptions({
    queryKey: ["repertoires", repertoireId, "chapters", chapterId],
    queryFn: () =>
      parseResponse(
        api.repertoires[":repertoireId"].chapters[":chapterId"].$get({
          param: { repertoireId, chapterId },
        }),
      ),
  });
}

/**
 * The one color has exactly one book. The server keeps a list; the
 * product's top level is White and Black, so the landing resolves each
 * color to its oldest repertoire — the same "oldest judges" rule the
 * backend applies — and everything else in the UI works from that.
 */
export function repertoireOfColor(
  repertoires: readonly RepertoireSummary[],
  color: "white" | "black",
): RepertoireSummary | null {
  // The list arrives oldest-first from the server.
  return repertoires.find((repertoire) => repertoire.color === color) ?? null;
}
