/**
 * Repertoire-line seeding — the third origin: not a mistake anyone made,
 * but the preparation itself, position by position. Runs when a chapter
 * lands (manual add or extraction), so a book becomes trainable the
 * moment it exists instead of waiting for its owner to fail in a game.
 *
 * Volume note: a chapter is tens of decision positions, and they enter
 * the queue as `new` cards. The scoped queue (`?repertoire=`/`?chapter=`)
 * is what keeps a fresh extraction from burying the mistake drills — the
 * two ship together on purpose.
 *
 * Kept Database-first, same reasoning as `seed-exercises.ts`: both
 * `repertoires/add-chapter` and `repertoires/extract-repertoire` call
 * `seedRepertoireLines` through their own declared dependency, wired at
 * the composition root rather than a same-package shortcut.
 *
 * `buildRepertoire` is imported from `@velachess/repertoires`'s
 * `index.ts` — no longer the old `@velachess/repertoire` package. That
 * used to create a real circular package dependency (repertoires' own
 * `extract-repertoire.ts` imported this file's `seedRepertoireLines`
 * right back), resolved by `ensureCandidateRepertoires` taking its
 * drills dependency injected instead of importing it directly — see that
 * function's doc comment. The only edge left is this one, drills ->
 * repertoires, for a pure-policy import with no edge back.
 */

import { parsePgn } from "@velachess/chess";
import type { Database } from "@velachess/infra-db";
import { getRepertoireWithChapters, upsertExercise } from "@velachess/infra-db";
import { buildRepertoire } from "@velachess/repertoires";

import { decisionPositionsOf } from "./decision-positions.ts";
import { seedFromDecisionPosition } from "./exercise.ts";

export interface SeedLinesOutcome {
  chapters: number;
  /** Decision positions found across the chapters. */
  positions: number;
  /** Exercises written (an already-seeded position upserts, not doubles). */
  seeded: number;
}

/** Seeds every chapter of one repertoire. Idempotent: identity is
 * (user, position), and re-running refreshes answers instead of piling
 * up duplicates. */
export async function seedRepertoireLines(
  db: Database,
  userId: string,
  repertoireId: string,
): Promise<SeedLinesOutcome> {
  const repertoire = await getRepertoireWithChapters(db, userId, repertoireId);
  if (!repertoire) return { chapters: 0, positions: 0, seeded: 0 };

  let positions = 0;
  let seeded = 0;

  for (const chapter of repertoire.chapters) {
    const parsed = parsePgn(chapter.pgn)[0];
    if (!parsed) continue;
    const built = buildRepertoire(parsed);
    if (built.isErr) continue;

    const decisions = decisionPositionsOf(built.unwrap(), repertoire.color);
    positions += decisions.length;

    for (const decision of decisions) {
      // Small per-chapter batch; sequential writes are fine here.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await upsertExercise(db, userId, seedFromDecisionPosition(chapter.id, decision));
      seeded++;
    }
  }

  return { chapters: repertoire.chapters.length, positions, seeded };
}
