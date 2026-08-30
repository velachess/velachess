/**
 * The one place that turns a raw PGN string into a NormalizedGame, no
 * matter which provider produced it. Every provider hands this the same
 * two things — the PGN text, and what it already knows about origin (which
 * it must supply itself: a PGN's own [Site] tag means something different
 * on each platform, see providers/chess-com.ts and providers/lichess.ts).
 */

import { emptyHeaders, openingNameFrom, parsePgn } from "@velachess/chess";

import { movetextHash } from "./hash.ts";
import type { GameSource, NormalizedGame, Perspective, SyncFailure } from "./schema.ts";

export interface NormalizeMeta {
  origin: GameSource;
  externalId: string | null;
  externalUrl: string | null;
  perspective?: Perspective | null;
}

const CLOCK_ANNOTATION = /\[%clk/;

/** Chess.com: "180" or "180+2". Lichess: "600+0". Same shape on both, verified live. */
function parseTimeControl(raw: string | undefined): {
  initialSeconds?: number;
  incrementSeconds?: number;
} {
  if (!raw) return {};
  const match = raw.match(/^(?<initial>\d+)(?:\+(?<increment>\d+))?$/);
  if (!match?.groups) return {};

  return {
    initialSeconds: Number(match.groups["initial"]),
    incrementSeconds: match.groups["increment"] ? Number(match.groups["increment"]) : 0,
  };
}

function parsePlayedAt(headers: Map<string, string>): Date | undefined {
  const date = headers.get("UTCDate") ?? headers.get("Date");
  const time = headers.get("UTCTime") ?? headers.get("StartTime");
  if (!date || date.includes("?")) return undefined;

  const isoDate = date.replaceAll(".", "-");
  const parsed = new Date(`${isoDate}T${time ?? "00:00:00"}Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseRating(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const rating = Number(value);
  return Number.isFinite(rating) ? rating : undefined;
}

const VALID_RESULTS = new Set(["1-0", "0-1", "1/2-1/2", "*"]);

export function normalizeGame(
  rawPgn: string,
  meta: NormalizeMeta,
): NormalizedGame | SyncFailure {
  let games;
  try {
    games = parsePgn(rawPgn, emptyHeaders);
  } catch (error) {
    return {
      scope: "game",
      ref: meta.externalId ?? "pgn",
      reason: "parse-error",
      retryable: false,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  // chessops always returns at least one Game, even for non-PGN text — with
  // an empty headers map and an empty mainline. That, not an empty array,
  // is the real "nothing here" signal.
  const game = games[0];
  if (!game || game.headers.size === 0) {
    return {
      scope: "game",
      ref: meta.externalId ?? "pgn",
      reason: "parse-error",
      retryable: false,
      detail: "PGN text contained no parseable game",
    };
  }

  const headers = game.headers;
  const rawResult = headers.get("Result");
  const result =
    rawResult && VALID_RESULTS.has(rawResult)
      ? (rawResult as NormalizedGame["result"])
      : "*";

  const ecoUrl = headers.get("ECOUrl");
  const openingName = openingNameFrom({
    name: headers.get("Opening"),
    url: ecoUrl,
  });

  return {
    source: meta.origin,
    externalId: meta.externalId,
    externalUrl: meta.externalUrl,
    perspective: meta.perspective ?? null,
    white: {
      name: headers.get("White") ?? "?",
      rating: parseRating(headers.get("WhiteElo")),
    },
    black: {
      name: headers.get("Black") ?? "?",
      rating: parseRating(headers.get("BlackElo")),
    },
    result,
    playedAt: parsePlayedAt(headers),
    timeControl: {
      ...parseTimeControl(headers.get("TimeControl")),
      raw: headers.get("TimeControl"),
    },
    opening: {
      eco: headers.get("ECO"),
      name: openingName ?? undefined,
      url: ecoUrl ?? undefined,
    },
    termination: headers.get("Termination"),
    hasClocks: CLOCK_ANNOTATION.test(rawPgn),
    rawPgn,
    movetextHash: movetextHash(rawPgn),
  };
}

export function isSyncFailure(value: NormalizedGame | SyncFailure): value is SyncFailure {
  return "reason" in value;
}
