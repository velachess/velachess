import { Hono } from "hono";
import { z } from "zod";

import { addChapterToRepertoire } from "@velachess/application/repertoires/add-chapter/add-chapter";
import { extractRepertoire } from "@velachess/application/repertoires/extract-repertoire/extract-repertoire";
import { getChapterDetail } from "@velachess/application/repertoires/get-chapter/get-chapter";
import { getRepertoireDetail } from "@velachess/application/repertoires/get-repertoire/get-repertoire";
import { listRepertoiresWithAdherence } from "@velachess/application/repertoires/list-repertoires/list-repertoires";
import { createRepertoire, deleteRepertoire } from "@velachess/db";

import type { ApiEnv } from "../server.ts";
import type { ApiDeps } from "../deps.ts";
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

export function repertoiresRoutes(deps: ApiDeps) {
  return new Hono<ApiEnv>()
    .get("/", async (c) =>
      // Each book with how faithfully it was actually played. Adherence
      // rides along rather than sitting on its own route: it describes
      // this repertoire the way `name` and `color` do, and a card that
      // has to make a second call to say how the book is going will
      // render the emptier half first.
      c.json(await listRepertoiresWithAdherence(deps.db, c.get("userId"))),
    )
    .post("/", validateJson(createRepertoireSchema), async (c) => {
      const { name, color } = c.req.valid("json");
      const repertoire = await createRepertoire(deps.db, {
        userId: c.get("userId"),
        name,
        color,
        // Declared, not derived from games — confirmed from birth.
        source: "manual",
      });
      return c.json(repertoire, 201);
    })
    .post("/extract", validateJson(extractSchema), async (c) => {
      // Derive the candidate book from the user's own games. Idempotent
      // over the extracted target — and a refusal, not an overwrite, when
      // that target was manually confirmed: games are evidence, not
      // intent, and confirmed preparation never mutates from new games.
      const { color, minGames, maxPlies } = c.req.valid("json");
      const outcome = await extractRepertoire(deps.db, c.get("userId"), color, {
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
      // per-chapter rates, preparation gaps, uncovered openings. Chapter
      // *content* (tree, board data) stays on the chapter detail route.
      const repertoire = await getRepertoireDetail(
        deps.db,
        c.get("userId"),
        c.req.valid("param").id,
      );
      if (!repertoire) return c.json({ error: "repertoire not found" }, 404);
      return c.json(repertoire);
    })
    .delete("/:id", validateIdParam, async (c) => {
      // Judgment history survives: deviations keep name snapshots and
      // their repertoire_id becomes null (ON DELETE SET NULL).
      const deleted = await deleteRepertoire(
        deps.db,
        c.get("userId"),
        c.req.valid("param").id,
      );
      if (!deleted) return c.json({ error: "repertoire not found" }, 404);
      return c.body(null, 204);
    })
    .post("/:id/chapters", validateIdParam, validateJson(addChapterSchema), async (c) => {
      const outcome = await addChapterToRepertoire(
        deps.db,
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
        deps.db,
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
