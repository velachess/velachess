import { engineSignalForDeviation } from "@velachess/analysis";
import { parsePgn, replayMainline } from "@velachess/chess";
import type { Database } from "@velachess/db";
import {
  applyEngineSignal,
  getAnalysis,
  getRepertoireWithChapters,
  listRepertoiresByUser,
  listUnjudgedGames,
  upsertJudgment,
  upsertUnmatchedJudgment,
} from "@velachess/db";
import type { AnalysisQueue } from "@velachess/queue/ports";
import type { BuiltRepertoire } from "@velachess/repertoire";
import {
  buildRepertoire,
  judgeAgainstChapters,
  judgmentType,
} from "@velachess/repertoire";

import { resolveGamePerspective } from "../../perspective.ts";
import { triageAndSeed } from "../../drills/seed-exercises/seed-exercises.ts";

export interface JudgeOutcome {
  judged: number;
  skipped: number;
  enqueuedForAnalysis: number;
}

export interface JudgeOptions {
  /**
   * Send every fresh deviation to the engine. Off by default: judging is
   * cheap replay, analysis is Stockfish, and importing an archive would
   * otherwise fan out into hundreds of engine runs nobody asked for.
   * Analysis has one producer — opening a game.
   */
  enqueueAnalysis?: boolean;
}

/**
 * Judges every unjudged game of the user against the repertoire matching
 * the game's perspective. When the enqueue is on, judgment and analysis
 * enqueue share one transaction — either both happen or neither.
 */
export async function judgeGamesForUser(
  db: Database,
  userId: string,
  queue: AnalysisQueue,
  opts: JudgeOptions = {},
): Promise<JudgeOutcome> {
  const { enqueueAnalysis = false } = opts;
  /**
   * One judging repertoire per color, deterministically: CONFIRMED
   * preparation first, oldest of it; a derived candidate only when the
   * color has no confirmed book.
   *
   * It used to be "oldest with chapters", full stop. That broke the day
   * repertoires started being derived automatically at import: the
   * candidate is always older than anything the person writes
   * afterwards, so their own book would never judge a game. Intent
   * outranks evidence — which is the same rule extraction follows when
   * it refuses to overwrite a confirmed book.
   */
  const repertoiresByColor = new Map<
    string,
    {
      id: string;
      name: string;
      chapters: { id: string; name: string; built: BuiltRepertoire }[];
    }
  >();

  const byPreference = (await listRepertoiresByUser(db, userId)).toSorted(
    // Stable: only the confirmed/derived split reorders, the query's
    // oldest-first order decides everything else.
    (a, b) => Number(b.source === "manual") - Number(a.source === "manual"),
  );

  for (const repertoire of byPreference) {
    // Small per-user list, building the judging map below in a fixed order.
    // oxlint-disable-next-line eslint/no-await-in-loop
    const loaded = await getRepertoireWithChapters(db, userId, repertoire.id);
    if (!loaded || loaded.chapters.length === 0) continue;

    const chapters = [];
    for (const chapter of loaded.chapters) {
      const parsed = parsePgn(chapter.pgn)[0];
      if (!parsed) continue;
      const built = buildRepertoire(parsed);
      if (built.isErr) continue;
      chapters.push({ id: chapter.id, name: chapter.name, built: built.unwrap() });
    }
    if (chapters.length > 0 && !repertoiresByColor.has(repertoire.color)) {
      repertoiresByColor.set(repertoire.color, {
        id: repertoire.id,
        name: repertoire.name,
        chapters,
      });
    }
  }

  let judged = 0;
  let skipped = 0;
  let enqueuedForAnalysis = 0;

  // Per repertoire (cycle 6): a game is pending for repertoire R until R
  // judged it — so a freshly extracted repertoire reaches games older
  // repertoires already judged. Games of the other color simply aren't
  // this repertoire's concern and are not counted as skipped.
  for (const [color, repertoire] of repertoiresByColor) {
    // Per repertoire (cycle 6, see above): games must be judged in this
    // ordering, oldest repertoire first.
    // oxlint-disable-next-line eslint/no-await-in-loop
    for (const game of await listUnjudgedGames(db, userId, repertoire.id)) {
      const perspective = resolveGamePerspective(game);
      if (perspective !== color) continue;

      // Every skip is persisted as 'unmatched', never silently dropped:
      // an unpersisted skip is rescanned by every future judge run, and
      // "my preparation doesn't speak to N of my games" is an answer the
      // statistics need, not an absence.
      const parsed = parsePgn(game.rawPgn)[0];
      if (!parsed) {
        // oxlint-disable-next-line eslint/no-await-in-loop
        await upsertUnmatchedJudgment(db, {
          gameId: game.id,
          repertoireId: repertoire.id,
          repertoireName: repertoire.name,
        });
        skipped++;
        continue;
      }
      const replayed = replayMainline(parsed);
      if (replayed.isErr) {
        // oxlint-disable-next-line eslint/no-await-in-loop
        await upsertUnmatchedJudgment(db, {
          gameId: game.id,
          repertoireId: repertoire.id,
          repertoireName: repertoire.name,
        });
        skipped++;
        continue;
      }
      const replay = replayed.unwrap();

      const judgment = judgeAgainstChapters(
        repertoire.chapters.map((c) => c.built),
        replay,
        perspective,
      );
      if (!judgment) {
        // oxlint-disable-next-line eslint/no-await-in-loop
        await upsertUnmatchedJudgment(db, {
          gameId: game.id,
          repertoireId: repertoire.id,
          repertoireName: repertoire.name,
          gamePlies: replay.moves.length,
        });
        skipped++;
        continue;
      }

      const chapter = repertoire.chapters[judgment.chapterIndex]!;
      const isOwnDeviation = judgmentType(judgment.result) === "deviation";

      // Per-repertoire re-judging makes "analysis cached BEFORE this
      // judgment exists" a normal ordering. The completion transaction
      // only crosses judgments that exist at completion time — so when the
      // report is already cached, the severity is filled HERE, in the same
      // transaction as the judgment, and nothing is enqueued (there is
      // nothing left to compute). The two paths cover both orderings.
      // oxlint-disable-next-line eslint/no-await-in-loop
      const cachedAnalysis = isOwnDeviation ? await getAnalysis(db, game.id) : null;
      let enqueued = false;

      // Judgment + analysis-enqueue must commit together, per game.
      // oxlint-disable-next-line eslint/no-await-in-loop
      await db.transaction(async (tx) => {
        const saved = await upsertJudgment(
          tx,
          {
            gameId: game.id,
            repertoireId: repertoire.id,
            chapterId: chapter.id,
            repertoireName: repertoire.name,
            chapterName: chapter.name,
            gamePlies: replay.moves.length,
          },
          judgment.result,
        );
        if (!isOwnDeviation) return;

        // A report already cached — from the last time this game was
        // opened — fills the severity here, in the judgment's own
        // transaction. Nothing to compute, whatever the option says.
        if (cachedAnalysis && saved.ply !== null) {
          const signal = engineSignalForDeviation(cachedAnalysis.positions, saved.ply);
          if (signal) await applyEngineSignal(tx, saved.id, signal);
        } else if (enqueueAnalysis) {
          await queue.enqueue(tx, game.id);
          enqueued = true;
        }
      });

      judged++;
      if (enqueued) enqueuedForAnalysis++;
    }
  }

  // Drills follow judgment, the way they follow analysis: a deviation
  // only becomes an exercise once the engine has said it hurt, and the
  // engine signal is filled right above. Without this the repertoire
  // origin would need someone to press a button.
  if (judged > 0) await triageAndSeed(db, userId);

  return { judged, skipped, enqueuedForAnalysis };
}
