import { Hono } from "hono";
import { z } from "zod";

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
import { validateChapterParams, validateIdParam, validateJson } from "../validation.ts";

const createRepertoireSchema = z.object({
  name: z.string().min(1),
  color: z.enum(["white", "black"]),
});

const extractSchema = z.object({
  color: z.enum(["white", "black"]),
  minGames: z.number().int().min(1).optional(),
  maxPlies: z.number().int().min(2).max(40).optional(),
});

const addChapterSchema = z.object({
  name: z.string().min(1),
  pgn: z.string().min(1),
  sortOrder: z.number().int().min(0).default(0),
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

export function repertoiresRoutes(deps: RepertoiresRouteDeps) {
  return new Hono<ApiEnv>()
    .get("/", async (c) =>
      // Each book with how faithfully it was actually played. Adherence
      // rides along rather than sitting on its own route: it describes
      // this repertoire the way `name` and `color` do, and a card that
      // has to make a second call to say how the book is going will
      // render the emptier half first.
      c.json(await listRepertoiresWithAdherence(deps.list, c.get("userId"))),
    )
    .post("/", validateJson(createRepertoireSchema), async (c) => {
      const repertoire = await createRepertoire(
        deps.create,
        c.get("userId"),
        c.req.valid("json"),
      );
      return c.json(repertoire, 201);
    })
    .post("/extract", validateJson(extractSchema), async (c) => {
      // Derive the candidate book from the user's own games. Idempotent
      // over the extracted target — and a refusal, not an overwrite, when
      // that target was manually confirmed: games are evidence, not
      // intent, and confirmed preparation never mutates from new games.
      const { color, minGames, maxPlies } = c.req.valid("json");
      const outcome = await extractRepertoire(deps.extract, c.get("userId"), color, {
        ...(minGames !== undefined ? { minGames } : {}),
        ...(maxPlies !== undefined ? { maxPlies } : {}),
      });
      if (outcome.status === "refused-confirmed") {
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
    .get("/:id", validateIdParam, async (c) => {
      // The repertoire opened: header, ordered chapters, and the
      // statistics the shared judgment rows derive — outcomes, adherence,
      // per-chapter rates, uncovered openings. Chapter
      // *content* (tree, board data) stays on the chapter detail route.
      const repertoire = await getRepertoireDetail(
        deps.detail,
        c.get("userId"),
        c.req.valid("param").id,
      );
      if (!repertoire) return c.json({ error: "repertoire not found" }, 404);
      return c.json(repertoire);
    })
    .delete("/:id", validateIdParam, async (c) => {
      const deleted = await deleteRepertoire(
        deps.remove,
        c.get("userId"),
        c.req.valid("param").id,
      );
      if (!deleted) return c.json({ error: "repertoire not found" }, 404);
      return c.body(null, 204);
    })
    .post("/:id/chapters", validateIdParam, validateJson(addChapterSchema), async (c) => {
      const outcome = await addChapter(
        deps.addChapter,
        c.get("userId"),
        c.req.valid("param").id,
        c.req.valid("json"),
      );
      if (outcome.status === "not-found")
        return c.json({ error: "repertoire not found" }, 404);
      if (outcome.status === "invalid-pgn")
        return c.json({ error: "pgn does not build a repertoire tree" }, 400);
      return c.json(outcome, 201);
    })
    .get("/:repertoireId/chapters/:chapterId", validateChapterParams, async (c) => {
      const { repertoireId, chapterId } = c.req.valid("param");
      const outcome = await getChapterDetail(
        deps.chapter,
        c.get("userId"),
        repertoireId,
        chapterId,
      );
      if (outcome.status === "not-found")
        return c.json({ error: "chapter not found" }, 404);
      if (outcome.status === "unreadable")
        return c.json({ error: "chapter pgn no longer builds" }, 422);
      return c.json(outcome.chapter);
    });
}
