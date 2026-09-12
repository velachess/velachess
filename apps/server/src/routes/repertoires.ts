import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import {
  addChapter,
  createRepertoire,
  deleteRepertoire,
  extractRepertoire,
  getChapterDetail,
  getRepertoireDetail,
  listRepertoiresWithAdherence,
  type AddChapterDeps,
  type CreateRepertoireDeps,
  type DeleteRepertoireDeps,
  type ExtractRepertoireDeps,
  type GetChapterDeps,
  type GetRepertoireDeps,
  type ListRepertoiresDeps,
} from "@velachess/repertoires";

import type { ApiEnv } from "../server.ts";
import { defaultHook, errorResponseSchema, idParamSchema } from "../validation.ts";

/** `@velachess/repertoires`' `ExtractOutcome.status` vocabulary. */
const EXTRACT_STATUS = {
  NOTHING_TO_EXTRACT: "nothing-to-extract",
  EXTRACTED: "extracted",
  REFUSED_CONFIRMED: "refused-confirmed",
} as const;

/** `@velachess/repertoires`' `AddChapterOutcome.status` vocabulary. */
const ADD_CHAPTER_STATUS = {
  ADDED: "added",
  NOT_FOUND: "not-found",
  INVALID_PGN: "invalid-pgn",
} as const;

/** `@velachess/repertoires`' `ChapterOutcome.status` vocabulary. */
const CHAPTER_STATUS = {
  FOUND: "found",
  NOT_FOUND: "not-found",
  UNREADABLE: "unreadable",
} as const;

/** Repeated across three of this file's 404s — one place to change the wording. */
const REPERTOIRE_NOT_FOUND_ERROR = "repertoire not found";

const createRepertoireSchema = z.object({
  name: z.string().min(1),
  color: z.enum(["white", "black"]),
});

const extractSchema = z.object({
  color: z.enum(["white", "black"]),
  minGames: z.number().int().min(1).optional(),
  maxPlies: z.number().int().min(2).max(40).optional(),
});

const addChapterBodySchema = z.object({
  name: z.string().min(1),
  pgn: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
});

/** Mirrors `@velachess/repertoires`' `AdherenceMetrics`. */
const outcomeBucketSchema = z.object({
  total: z.number().int(),
  wins: z.number().int(),
  draws: z.number().int(),
  losses: z.number().int(),
  winRate: z
    .number()
    .describe("wins / decided games in the bucket, 0 when none carry a result."),
});
const adherenceMetricsSchema = z.object({
  judgedGames: z.number().int(),
  skippedGames: z
    .number()
    .int()
    .describe("Below the minJudgedPlies floor — too short to say anything."),
  faithfulGames: z.number().int(),
  adherenceRate: z.number(),
  averagePrepDepth: z.number(),
  inBook: outcomeBucketSchema,
  outOfBook: outcomeBucketSchema,
});

/** Mirrors `@velachess/infra-db`'s `Repertoire` — `createdAt`/`updatedAt`
 * travel as ISO text on the wire, not a `Date`. */
const repertoireBaseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  color: z.enum(["white", "black"]),
  source: z
    .enum(["manual", "extracted"])
    .describe(
      "'extracted' = a candidate derived from games that re-extraction may replace; 'manual' = declared or edited preparation, which extraction refuses to overwrite.",
    ),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const repertoireWithAdherenceSchema = repertoireBaseSchema.extend({
  adherence: adherenceMetricsSchema
    .nullable()
    .describe("Null until at least one game has been judged against this book."),
  chapterCount: z.number().int(),
  gaps: z
    .number()
    .int()
    .describe("Opponent moves this book has no answer to (opponent-left judgments)."),
  training: z
    .object({ due: z.number().int(), fresh: z.number().int() })
    .describe("This book's slice of the drill queue."),
});

const listRepertoiresRoute = createRoute({
  method: "get",
  path: "/",
  summary: "List the user's repertoires, each with its adherence",
  description:
    "How faithful the played games were to each book: adherence rate, average prep depth in plies, and win/draw/loss inside versus outside the book. `adherence` is null until at least one game has been judged against that repertoire — null rather than zeros, because 'nothing judged yet' and 'judged, and never followed' are different answers.",
  responses: {
    200: {
      description: "Repertoires",
      content: { "application/json": { schema: z.array(repertoireWithAdherenceSchema) } },
    },
  },
});

const createRepertoireRoute = createRoute({
  method: "post",
  path: "/",
  summary: "Create a repertoire",
  request: {
    body: { content: { "application/json": { schema: createRepertoireSchema } } },
  },
  responses: {
    201: {
      description: "Created repertoire",
      content: { "application/json": { schema: repertoireBaseSchema } },
    },
  },
});

const nothingToExtractSchema = z.object({
  status: z.literal(EXTRACT_STATUS.NOTHING_TO_EXTRACT),
});
const extractedSchema = z.object({
  status: z.literal(EXTRACT_STATUS.EXTRACTED),
  repertoireId: z.string().uuid(),
  chapters: z
    .number()
    .int()
    .describe("Chapters written (0 = no line reached minGames support)."),
  gamesConsidered: z.number().int(),
  seeded: z
    .number()
    .int()
    .describe("Decision positions written into the training queue."),
});
const refusedConfirmedSchema = errorResponseSchema.extend({
  repertoireId: z.string().uuid(),
});

const extractRepertoireRoute = createRoute({
  method: "post",
  path: "/extract",
  summary: "Extract a repertoire from the user's own games",
  description:
    "Builds a frequency trie over the synced games of the color and writes each supported line as a chapter of that color's repertoire (identified by (user, color), never by name). Idempotent over the extracted candidate: re-extraction replaces its chapters and clears its judgments (games re-judge against the new book). Refused with 409 when the target was manually edited — a confirmed repertoire never mutates from new games. Each chapter's decision positions seed the training queue as repertoire-line exercises.",
  request: {
    body: { content: { "application/json": { schema: extractSchema } } },
  },
  responses: {
    201: {
      description: "Extraction outcome (chapters may be 0 when no line reaches minGames)",
      content: {
        "application/json": {
          schema: z.discriminatedUnion("status", [
            nothingToExtractSchema,
            extractedSchema,
          ]),
        },
      },
    },
    409: {
      description:
        "The extraction target is confirmed (manually edited) preparation — delete or rename it to extract fresh",
      content: { "application/json": { schema: refusedConfirmedSchema } },
    },
  },
});

/** Mirrors `@velachess/repertoires`' `OutcomeCounts` — the product
 * vocabulary over the judgment-type storage enum. */
const outcomeCountsSchema = z.object({
  held: z.number().int(),
  playerLeft: z.number().int(),
  opponentLeft: z.number().int(),
  repertoireEnded: z.number().int(),
  unmatched: z.number().int(),
});

const chapterListEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  sortOrder: z.number().int(),
  outcomes: outcomeCountsSchema,
  adherenceRate: z
    .number()
    .nullable()
    .describe("held / (held + playerLeft); null below one judged game."),
  recallFailures: z
    .number()
    .int()
    .describe("Real-game recall failures: the owner left this chapter's line."),
  gaps: z.number().int(),
  training: z.object({ due: z.number().int(), fresh: z.number().int() }),
});

const uncoveredOpeningSchema = z.object({ opening: z.string(), games: z.number().int() });

const repertoireStatsSchema = z.object({
  matchedGames: z.number().int(),
  unmatchedGames: z.number().int(),
  outcomes: outcomeCountsSchema,
  adherence: adherenceMetricsSchema.nullable(),
  uncoveredOpenings: z
    .array(uncoveredOpeningSchema)
    .describe("What the unmatched games opened as — the coverage worth adding next."),
});

const repertoireDetailSchema = repertoireBaseSchema.extend({
  chapters: z
    .array(chapterListEntrySchema)
    .describe(
      "List rows, deliberately without PGN — the tree ships on the chapter detail route when a chapter is opened.",
    ),
  stats: repertoireStatsSchema.describe(
    "Derived from judgment rows — never recomputed from games. The outcome vocabulary maps 1:1 onto storage: held=completed, playerLeft=deviation, opponentLeft=gap, repertoireEnded=book-ended.",
  ),
});

const getRepertoireRoute = createRoute({
  method: "get",
  path: "/{id}",
  summary: "A repertoire with its chapters and statistics",
  description:
    "Header, ordered chapters (name, pgn, order — the tree ships on the chapter detail route), and the statistics the shared judgment rows derive: one of five mutually exclusive outcomes per judged game (held, playerLeft, opponentLeft, repertoireEnded, unmatched), adherence, per-chapter rates, and what the unmatched games opened as.",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "Repertoire header plus ordered chapters (name, pgn)",
      content: { "application/json": { schema: repertoireDetailSchema } },
    },
    404: {
      description: "Unknown repertoire",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

const deleteRepertoireRoute = createRoute({
  method: "delete",
  path: "/{id}",
  summary: "Delete a repertoire",
  description:
    "Judgment history survives: deviations keep name snapshots and their repertoire link becomes null.",
  request: { params: idParamSchema },
  responses: {
    204: { description: "Deleted" },
    404: {
      description: "Unknown repertoire",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

const addedChapterSchema = z.object({
  status: z.literal(ADD_CHAPTER_STATUS.ADDED),
  chapter: z.object({
    id: z.string().uuid(),
    repertoireId: z.string().uuid(),
    name: z.string(),
    sortOrder: z.number().int(),
    pgn: z.string(),
  }),
  reopened: z
    .number()
    .int()
    .describe("Judgments reopened for re-judging against the grown book."),
  seeded: z.number().int().describe("Decision positions seeded into the training queue."),
});
const invalidPgnSchema = errorResponseSchema;

const addChapterRoute = createRoute({
  method: "post",
  path: "/{id}/chapters",
  summary: "Add a PGN chapter to a repertoire",
  request: {
    params: idParamSchema,
    body: { content: { "application/json": { schema: addChapterBodySchema } } },
  },
  responses: {
    201: {
      description:
        "Chapter added. Adding confirms an extracted repertoire (extraction stops overwriting it), reopens the judgments a bigger book might answer differently (opponentLeft, repertoireEnded, unmatched — playerLeft evidence stays), and seeds the chapter's decision positions into the training queue.",
      content: { "application/json": { schema: addedChapterSchema } },
    },
    404: {
      description: "Unknown repertoire",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    400: {
      description: "A PGN that does not build a repertoire tree",
      content: { "application/json": { schema: invalidPgnSchema } },
    },
  },
});

/** Mirrors `@velachess/repertoires`' `get-chapter/chapter-view.ts` types. */
const moveCursorSchema = z.object({
  line: z.number().int(),
  move: z.number().int(),
});
const preparedMoveSchema = z.object({
  san: z.string(),
  from: z.string(),
  to: z.string(),
  at: moveCursorSchema.describe(
    "Where playing it lands — so a click on the answer navigates.",
  ),
});
const chapterStartViewSchema = z.object({
  positionKey: z.string(),
  fen: z.string(),
  isOwnTurn: z.boolean(),
  prepared: z.array(preparedMoveSchema),
});
const chapterMoveViewSchema = z.object({
  san: z.string(),
  label: z.string().describe('"1. e4", "e5", "2... Nf6" — numbering already resolved.'),
  positionKey: z.string(),
  fen: z.string(),
  from: z.string(),
  to: z.string(),
  ply: z.number().int(),
  isOwnTurn: z.boolean(),
  prepared: z
    .array(preparedMoveSchema)
    .describe("What the book plays from this position. Empty where the line ends."),
});
const chapterLineViewSchema = z.object({
  depth: z
    .number()
    .int()
    .describe("0 for the mainline, 1 for a variation of it, and so on."),
  branchesFrom: moveCursorSchema
    .nullable()
    .describe("The move this line replaces. Null for the mainline."),
  prefix: z.array(z.object({ label: z.string(), at: moveCursorSchema })),
  moves: z.array(chapterMoveViewSchema),
});
const illegalRepertoireMoveSchema = z.object({
  path: z
    .array(z.string())
    .describe("SANs from the root leading up to (not including) the illegal move."),
  san: z.string(),
  positionKeyBefore: z.string(),
});

const chapterDetailSchema = z.object({
  id: z.string().uuid(),
  repertoireId: z.string().uuid(),
  repertoireName: z.string(),
  color: z.enum(["white", "black"]),
  name: z.string(),
  sortOrder: z.number().int(),
  pgn: z.string(),
  start: chapterStartViewSchema.describe(
    "Where the board opens — already playable, no conversion in the client.",
  ),
  lines: z
    .array(chapterLineViewSchema)
    .describe(
      "The chapter in reading order: the mainline first, then each variation as its own line carrying the cursor it replaces ({line, move}) and the labeled trail into it. Every move ships interpreted — label ('2... Nf6'), playable fen, the squares it touched, whose turn it is, and the moves prepared from it with the cursor each lands on.",
    ),
  illegalMoves: z
    .array(illegalRepertoireMoveSchema)
    .describe(
      "Authored branches the PGN lost to illegal moves — surfaced, never silently dropped.",
    ),
});

const getChapterRoute = createRoute({
  method: "get",
  path: "/{repertoireId}/chapters/{chapterId}",
  summary: "One chapter, with everything an interactive board needs",
  description:
    "The heavy endpoint by design: the variation tree as plain nested nodes (san, positionKey, comments, nags, children), the decision positions the owner must recall (position, prepared responses, canonical path), and the branches the PGN lost to illegal moves. Lists stay light; this ships when a chapter is opened.",
  request: {
    params: z.object({
      repertoireId: z
        .string()
        .uuid()
        .openapi({ param: { name: "repertoireId", in: "path" } }),
      chapterId: z
        .string()
        .uuid()
        .openapi({ param: { name: "chapterId", in: "path" } }),
    }),
  },
  responses: {
    200: {
      description: "Chapter content",
      content: { "application/json": { schema: chapterDetailSchema } },
    },
    404: {
      description: "Unknown chapter",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    422: {
      description: "The stored PGN no longer parses or builds",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
});

/** Each route's own narrow deps, composed separately — the seven don't
 * share a shape. See apps/server/src/composition/repertoires.ts. */
export interface RepertoiresRouteDeps {
  list: ListRepertoiresDeps;
  create: CreateRepertoireDeps;
  extract: ExtractRepertoireDeps;
  detail: GetRepertoireDeps;
  remove: DeleteRepertoireDeps;
  addChapter: AddChapterDeps;
  chapter: GetChapterDeps;
}

function toWireRepertoire<T extends { createdAt: Date; updatedAt: Date }>(repertoire: T) {
  return Object.assign({}, repertoire, {
    createdAt: repertoire.createdAt.toISOString(),
    updatedAt: repertoire.updatedAt.toISOString(),
  });
}

export function repertoiresRoutes(deps: RepertoiresRouteDeps) {
  return (
    new OpenAPIHono<ApiEnv>({ defaultHook })
      // Each book with how faithfully it was actually played. Adherence
      // rides along rather than sitting on its own route: it describes
      // this repertoire the way `name` and `color` do, and a card that
      // has to make a second call to say how the book is going will
      // render the emptier half first.
      .openapi(listRepertoiresRoute, async (c) => {
        const repertoires = await listRepertoiresWithAdherence(
          deps.list,
          c.get("userId"),
        );
        return c.json(repertoires.map(toWireRepertoire), 200);
      })
      .openapi(createRepertoireRoute, async (c) => {
        const repertoire = await createRepertoire(
          deps.create,
          c.get("userId"),
          c.req.valid("json"),
        );
        return c.json(toWireRepertoire(repertoire), 201);
      })
      .openapi(extractRepertoireRoute, async (c) => {
        // Derive the candidate book from the user's own games. Idempotent
        // over the extracted target — and a refusal, not an overwrite, when
        // that target was manually confirmed: games are evidence, not
        // intent, and confirmed preparation never mutates from new games.
        const { color, minGames, maxPlies } = c.req.valid("json");
        const outcome = await extractRepertoire(deps.extract, c.get("userId"), color, {
          ...(minGames !== undefined ? { minGames } : {}),
          ...(maxPlies !== undefined ? { maxPlies } : {}),
        });
        if (outcome.status === EXTRACT_STATUS.REFUSED_CONFIRMED) {
          return c.json(
            {
              error: "extraction target is confirmed preparation",
              repertoireId: outcome.repertoireId,
            },
            409,
          );
        }
        return c.json(outcome, 201);
      })
      .openapi(getRepertoireRoute, async (c) => {
        // The repertoire opened: header, ordered chapters, and the
        // statistics the shared judgment rows derive — outcomes, adherence,
        // per-chapter rates, uncovered openings. Chapter
        // *content* (tree, board data) stays on the chapter detail route.
        const repertoire = await getRepertoireDetail(
          deps.detail,
          c.get("userId"),
          c.req.valid("param").id,
        );
        if (!repertoire) return c.json({ error: REPERTOIRE_NOT_FOUND_ERROR }, 404);
        return c.json(toWireRepertoire(repertoire), 200);
      })
      .openapi(deleteRepertoireRoute, async (c) => {
        const deleted = await deleteRepertoire(
          deps.remove,
          c.get("userId"),
          c.req.valid("param").id,
        );
        if (!deleted) return c.json({ error: REPERTOIRE_NOT_FOUND_ERROR }, 404);
        return c.body(null, 204);
      })
      .openapi(addChapterRoute, async (c) => {
        const outcome = await addChapter(
          deps.addChapter,
          c.get("userId"),
          c.req.valid("param").id,
          c.req.valid("json"),
        );
        if (outcome.status === ADD_CHAPTER_STATUS.NOT_FOUND)
          return c.json({ error: REPERTOIRE_NOT_FOUND_ERROR }, 404);
        if (outcome.status === ADD_CHAPTER_STATUS.INVALID_PGN)
          return c.json({ error: "pgn does not build a repertoire tree" }, 400);
        return c.json(outcome, 201);
      })
      .openapi(getChapterRoute, async (c) => {
        const { repertoireId, chapterId } = c.req.valid("param");
        const outcome = await getChapterDetail(
          deps.chapter,
          c.get("userId"),
          repertoireId,
          chapterId,
        );
        if (outcome.status === CHAPTER_STATUS.NOT_FOUND)
          return c.json({ error: "chapter not found" }, 404);
        if (outcome.status === CHAPTER_STATUS.UNREADABLE)
          return c.json({ error: "chapter pgn no longer builds" }, 422);
        return c.json(outcome.chapter, 200);
      })
  );
}
