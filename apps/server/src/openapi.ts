/**
 * Hand-authored OpenAPI 3.1 document, served at GET /openapi.json.
 * Anti-drift: tests/openapi.test.ts fails if any registered Hono route is
 * missing here (or vice versa) — the spec cannot silently rot.
 */

const jsonOf = (schema: Record<string, unknown>) => ({
  content: { "application/json": { schema } },
});

const errorResponse = jsonOf({
  type: "object",
  properties: { error: { type: "string" } },
  required: ["error"],
});

/** Win/draw/loss from the owner's seat. `winRate` is wins over decided
 * games, so a draw counts as a loss — the same definition adherenceMetrics
 * uses, stated here so a client does not invent a second one. */
const outcomeBucket = {
  type: "object",
  properties: {
    total: { type: "integer" },
    wins: { type: "integer" },
    draws: { type: "integer" },
    losses: { type: "integer" },
    winRate: { type: "number" },
  },
} as const;

const analysisSchema = {
  type: "object",
  description: "Persisted engine report for a game",
  properties: {
    id: { type: "string", format: "uuid" },
    gameId: { type: "string", format: "uuid" },
    engineVersion: { type: "string" },
    depth: { type: "integer" },
    positions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ply: { type: "integer" },
          san: { type: "string" },
          scoreCp: { type: "integer" },
          mateIn: { type: ["integer", "null"] },
          bestMoveUci: { type: "string" },
          judgment: { type: "string" },
        },
      },
    },
  },
} as const;

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "VelaChess API",
    version: "0.1.0",
    description:
      "Sync games, judge them against your repertoire, analyze deviations with an engine, and drill the fixes on a spaced-repetition schedule.",
  },
  paths: {
    "/health": {
      get: {
        summary: "Liveness probe",
        responses: {
          "200": {
            description: "API is up",
            ...jsonOf({
              type: "object",
              properties: { ok: { type: "boolean" } },
              required: ["ok"],
            }),
          },
        },
      },
    },
    "/config": {
      get: {
        summary: "What this deployment offers, before anyone signs in",
        description:
          "Public by necessity: the sign-in screen has to know which methods exist before it can render them, and it has no session yet. Carries capability flags only — never credentials, never anything about a user.",
        responses: {
          "200": {
            description: "Sign-in methods this instance actually offers",
            ...jsonOf({
              type: "object",
              properties: {
                signInMethods: {
                  type: "object",
                  properties: {
                    password: { type: "boolean" },
                    google: { type: "boolean" },
                  },
                  required: ["password", "google"],
                },
              },
              required: ["signInMethods"],
            }),
          },
        },
      },
    },
    "/openapi.json": {
      get: {
        summary: "This document",
        responses: {
          "200": { description: "OpenAPI 3.1 spec", ...jsonOf({ type: "object" }) },
        },
      },
    },
    "/accounts": {
      get: {
        summary: "List the accounts this user tracks",
        responses: {
          "200": {
            description: "Tracked accounts, oldest first",
            ...jsonOf({
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  platform: { type: "string", enum: ["chess_com", "lichess"] },
                  username: { type: "string" },
                  lastSyncedAt: { type: "string", format: "date-time", nullable: true },
                  syncState: {
                    type: "string",
                    enum: ["queued", "active", "failed", "none"],
                    description: "Delivery state of the newest non-completed sync job",
                  },
                },
                required: ["id", "platform", "username", "lastSyncedAt", "syncState"],
              },
            }),
          },
        },
      },
      post: {
        summary: "Track a chess.com or Lichess account",
        requestBody: {
          required: true,
          ...jsonOf({
            type: "object",
            properties: {
              platform: { type: "string", enum: ["chess_com", "lichess"] },
              username: { type: "string", minLength: 1 },
            },
            required: ["platform", "username"],
          }),
        },
        responses: {
          "201": {
            description: "Account tracked (idempotent upsert)",
            ...jsonOf({
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                platform: { type: "string" },
                username: { type: "string" },
              },
              required: ["id", "platform", "username"],
            }),
          },
          "400": { description: "Invalid body", ...errorResponse },
        },
      },
    },
    "/accounts/{id}/sync": {
      post: {
        summary: "Pull what's new for this account",
        description:
          "Interactive and synchronous: fetch, judge the new games against the repertoire, seed the exercises their severities allow, and report what changed. No engine runs — analysis is triggered by opening a game. Rate limited per account; 429 carries Retry-After.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "What the refresh changed",
            ...jsonOf({
              type: "object",
              properties: {
                saved: { type: "integer", description: "Games new to the archive" },
                judged: { type: "integer" },
                seeded: { type: "integer" },
              },
              required: ["saved", "judged", "seeded"],
            }),
          },
          "400": { description: "Malformed id (not a UUID)", ...errorResponse },
          "404": { description: "Unknown account", ...errorResponse },
          "429": {
            description: "Synced too recently — Retry-After says when",
            ...jsonOf({
              type: "object",
              properties: {
                error: { type: "string" },
                retryAfterSeconds: { type: "integer" },
              },
              required: ["error", "retryAfterSeconds"],
            }),
          },
        },
      },
    },
    "/accounts/{id}/games": {
      get: {
        summary: "Games of the account with judgment and analysis status",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Game list (no PGN payloads)",
            ...jsonOf({
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  whiteName: { type: "string" },
                  blackName: { type: "string" },
                  result: { type: "string" },
                  playedAt: { type: "string", format: "date-time" },
                  perspective: {
                    type: ["string", "null"],
                    enum: ["white", "black", null],
                  },
                  openingName: { type: ["string", "null"] },
                  judgmentType: { type: ["string", "null"] },
                  judgmentPly: { type: ["integer", "null"] },
                  analyzed: { type: "boolean" },
                },
              },
            }),
          },
          "400": { description: "Malformed id (not a UUID)", ...errorResponse },
          "404": { description: "Unknown account", ...errorResponse },
        },
      },
    },
    "/games": {
      get: {
        summary: "The signed-in user's unified game library",
        description:
          "One filtered page of every game the user owns — Chess.com and Lichess archives next to manually imported PGNs, provenance visible per row but never deciding what appears. A read, and nothing but a read: connecting a provider is POST /accounts, importing a file is POST /games/import, and keeping an archive current is POST /accounts/{id}/sync. Engine-free — analysis is triggered by opening a game, never by listing.",
        parameters: [
          {
            name: "color",
            in: "query",
            schema: { type: "string", enum: ["white", "black"] },
            description: "Which side you played, resolved per game",
          },
          {
            name: "outcome",
            in: "query",
            description: "From the player's side, not the scoresheet's",
            schema: { type: "string", enum: ["win", "loss", "draw"] },
          },
          {
            name: "verdict",
            in: "query",
            description:
              "The repertoire's verdict; `unjudged` means no book saw the game",
            schema: {
              type: "string",
              enum: ["deviation", "gap", "book-ended", "completed", "unjudged"],
            },
          },
          {
            name: "timeClass",
            in: "query",
            description: "Bucketed by estimated duration (initial + 40 × increment)",
            schema: { type: "string", enum: ["bullet", "blitz", "rapid", "classical"] },
          },
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
          },
        ],
        responses: {
          "200": {
            description:
              "One page of the user's games across every source (no PGN payloads)",
            ...jsonOf({
              type: "object",
              properties: {
                games: { type: "array", items: { type: "object" } },
                total: {
                  type: "integer",
                  description: "Rows matching the filters, not the page",
                },
                page: { type: "integer" },
                pageSize: { type: "integer" },
              },
              required: ["games", "total", "page", "pageSize"],
            }),
          },
          "400": {
            description: "Malformed filter or paging parameter",
            ...errorResponse,
          },
        },
      },
    },
    "/games/import": {
      post: {
        summary: "Import games from a PGN upload",
        description:
          "The manual source: no connected account, no cursor, no sync lifecycle — and no engine (analysis is triggered by opening a game). Every parseable game lands in the caller's library; `playerName` resolves which side is theirs per game, so one file may mix White and Black, and games naming them on neither side import unattributed. Re-importing is idempotent per user: duplicates are successful no-ops counted in the response, never errors. New games feed the same repertoire → judgment → seeding pass a sync runs.",
        requestBody: {
          required: true,
          ...jsonOf({
            type: "object",
            properties: {
              pgn: {
                type: "string",
                description: "One or more games in PGN format",
              },
              playerName: {
                type: "string",
                maxLength: 128,
                description: "The player these games belong to, as named in the headers",
              },
            },
            required: ["pgn"],
          }),
        },
        responses: {
          "200": {
            description: "What landed and what didn't, all three counts at once",
            ...jsonOf({
              type: "object",
              properties: {
                imported: {
                  type: "integer",
                  description: "Games written for this user",
                },
                duplicates: {
                  type: "integer",
                  description: "Games this user already had — skipped as a no-op",
                },
                rejected: {
                  type: "integer",
                  description: "Chunks that failed to parse",
                },
                judged: { type: "integer" },
                seeded: { type: "integer" },
              },
              required: ["imported", "duplicates", "rejected", "judged", "seeded"],
            }),
          },
          "400": { description: "Missing or empty body", ...errorResponse },
          "413": {
            description: "Payload exceeds the 256 KiB server limit",
            ...errorResponse,
          },
        },
      },
    },
    "/games/judge": {
      post: {
        summary: "Judge all unjudged games against the user's repertoires",
        description:
          "Replay only — no engine. Deviations wait for a severity until the game is opened and analyzed.",
        responses: {
          "200": {
            description: "Judgment outcome",
            ...jsonOf({
              type: "object",
              properties: {
                judged: { type: "integer" },
                skipped: { type: "integer" },
                enqueuedForAnalysis: { type: "integer" },
              },
              required: ["judged", "skipped", "enqueuedForAnalysis"],
            }),
          },
        },
      },
    },
    "/games/{id}": {
      get: {
        summary: "The full game, rawPgn included",
        description:
          "Board replay needs the movetext; the list endpoint deliberately omits it. Both seats carry their provider identity (avatarUrl / Lichess flair) resolved from a shared per-handle cache — fetched on the first open per refresh window, initials when unknown, and never a reason for the read to fail.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description:
              "Game row with rawPgn, players, result, opening and timing metadata",
            ...jsonOf({ type: "object" }),
          },
          "400": { description: "Malformed id (not a UUID)", ...errorResponse },
          "404": { description: "Unknown game", ...errorResponse },
        },
      },
    },
    "/games/{id}/analysis": {
      get: {
        summary: "Read-only analysis state for a game, with a run's progress",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Current state; includes the report when completed",
            ...jsonOf({
              type: "object",
              properties: {
                status: {
                  type: "string",
                  enum: ["created", "queued", "running", "failed", "completed"],
                },
                graded: {
                  type: "integer",
                  description:
                    "Positions a run in flight has graded. Absent — never zero — until a run reports; 'not started' and 'graded none' are different answers.",
                },
                total: {
                  type: "integer",
                  description: "Positions that run will grade. Present with `graded`.",
                },
                analysis: analysisSchema,
                drills: {
                  type: "object",
                  description:
                    "What the report's drill CTA counts. Present with `analysis`.",
                  properties: {
                    eligible: {
                      type: "integer",
                      description:
                        "Plies on the user's side this game would drill, seeded or not.",
                    },
                    seeded: {
                      type: "integer",
                      description: "Of those, the ones that already are an exercise.",
                    },
                    triaged: {
                      type: "boolean",
                      description:
                        "False while triage still owes this game exercises. The screen waits instead of announcing zero, which reads as 'nothing to drill'.",
                    },
                  },
                  required: ["eligible", "seeded", "triaged"],
                },
              },
              required: ["status"],
            }),
          },
          "400": { description: "Malformed id (not a UUID)", ...errorResponse },
          "404": { description: "Unknown game", ...errorResponse },
        },
      },
    },
    "/games/{id}/analysis/events": {
      get: {
        summary: "Watch a run's progress over Server-Sent Events",
        description:
          "A plain GET, so `EventSource` opens it directly. Observes durable state and owns no computation.\n\nEvents: `analysis.opened` (carries `retry`), `analysis.move-graded` per ply with the frame `id` set to its 0-based index, then a terminal `analysis.completed` carrying the whole report, or `analysis.failed`. No event is named `error`: that name collides with the one EventSource itself fires on transport failure.\n\nHonours `Last-Event-ID`, so a reconnection resumes from the frame after the one named rather than replaying the run. Sends `: keep-alive` comments so proxies do not close an idle stream, and `X-Accel-Buffering: no` so nginx does not buffer it. Ends without a terminal event on the connection deadline — not terminal for the run, and the browser reconnects.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Event stream, terminated by `done` or `error`",
            content: { "text/event-stream": { schema: { type: "string" } } },
          },
          "400": { description: "Malformed id (not a UUID)", ...errorResponse },
          "404": { description: "Unknown game", ...errorResponse },
        },
      },
    },
    "/games/{id}/analyze": {
      post: {
        summary: "Ask for a game to be analyzed",
        description:
          "The trigger, and only the trigger: it enqueues and returns, never holding the run open. State mapping: completed → 200 with the cached report; failed (retries exhausted) → 409; otherwise 202 and the worker takes it. Idempotent — asking twice for a queued game is the same 202, not a second run. Watch it at GET /games/{id}/analysis/events.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Already analyzed — the cached report, no run started",
            ...jsonOf({
              type: "object",
              properties: {
                status: { type: "string", enum: ["completed"] },
                analysis: analysisSchema,
              },
              required: ["status", "analysis"],
            }),
          },
          "202": {
            description: "Accepted: queued now, or already queued or running",
            ...jsonOf({
              type: "object",
              properties: { status: { type: "string", enum: ["queued", "running"] } },
              required: ["status"],
            }),
          },
          "400": { description: "Malformed id (not a UUID)", ...errorResponse },
          "404": { description: "Unknown game", ...errorResponse },
          "409": {
            description: "Delivery retries exhausted; the job is dead-lettered",
            ...jsonOf({
              type: "object",
              properties: { status: { type: "string", enum: ["failed"] } },
              required: ["status"],
            }),
          },
        },
      },
    },
    "/deviations": {
      get: {
        summary: "The user's own deviations, engine verdict and game context included",
        description:
          "One row per own-move deviation: what was played vs what the book expected, the engine's severity, repertoire/chapter attribution (snapshots survive deletion), the game it came from, a playable FEN of the position, and whether an exercise was already seeded from it.",
        responses: {
          "200": {
            description: "Deviations, newest games first",
            ...jsonOf({
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  gameId: { type: "string", format: "uuid" },
                  ply: { type: ["integer", "null"] },
                  playedSan: { type: ["string", "null"] },
                  expectedSans: { type: ["array", "null"], items: { type: "string" } },
                  fen: { type: ["string", "null"] },
                  cpLoss: { type: ["integer", "null"] },
                  engineCategory: {
                    type: ["string", "null"],
                    enum: ["ok", "inaccuracy", "mistake", "blunder", null],
                  },
                  drillable: { type: "boolean" },
                  drilled: { type: "boolean" },
                  repertoireName: { type: "string" },
                  chapterName: { type: "string" },
                  whiteName: { type: "string" },
                  blackName: { type: "string" },
                  result: { type: "string" },
                  playedAt: { type: ["string", "null"], format: "date-time" },
                  openingName: { type: ["string", "null"] },
                  gameUrl: { type: ["string", "null"] },
                },
              },
            }),
          },
        },
      },
    },
    "/repertoires": {
      get: {
        summary: "List the user's repertoires, each with its adherence",
        description:
          "How faithful the played games were to each book: adherence rate, average prep depth in plies, and win/draw/loss inside versus outside the book. `adherence` is null until at least one game has been judged against that repertoire — null rather than zeros, because 'nothing judged yet' and 'judged, and never followed' are different answers.",
        responses: {
          "200": {
            description: "Repertoires",
            ...jsonOf({
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  userId: { type: "string", format: "uuid" },
                  name: { type: "string" },
                  color: { type: "string", enum: ["white", "black"] },
                  source: {
                    type: "string",
                    enum: ["manual", "extracted"],
                    description:
                      "'extracted' = a candidate derived from games that re-extraction may replace; 'manual' = declared or edited preparation, which extraction refuses to overwrite.",
                  },
                  createdAt: { type: "string", format: "date-time" },
                  updatedAt: { type: "string", format: "date-time" },
                  adherence: {
                    type: "object",
                    nullable: true,
                    properties: {
                      judgedGames: { type: "integer" },
                      skippedGames: { type: "integer" },
                      faithfulGames: { type: "integer" },
                      adherenceRate: { type: "number" },
                      averagePrepDepth: { type: "number" },
                      inBook: outcomeBucket,
                      outOfBook: outcomeBucket,
                    },
                  },
                  chapterCount: { type: "integer" },
                  gaps: {
                    type: "integer",
                    description:
                      "Opponent moves this book has no answer to (opponent-left judgments).",
                  },
                  training: {
                    type: "object",
                    description: "This book's slice of the drill queue.",
                    properties: {
                      due: { type: "integer" },
                      fresh: { type: "integer" },
                    },
                    required: ["due", "fresh"],
                  },
                },
              },
            }),
          },
        },
      },
      post: {
        summary: "Create a repertoire",
        requestBody: {
          required: true,
          ...jsonOf({
            type: "object",
            properties: {
              name: { type: "string", minLength: 1 },
              color: { type: "string", enum: ["white", "black"] },
            },
            required: ["name", "color"],
          }),
        },
        responses: {
          "201": { description: "Created repertoire", ...jsonOf({ type: "object" }) },
          "400": { description: "Invalid body", ...errorResponse },
        },
      },
    },
    "/repertoires/extract": {
      post: {
        summary: "Extract a repertoire from the user's own games",
        description:
          "Builds a frequency trie over the synced games of the color and writes each supported line as a chapter of that color's repertoire (identified by (user, color), never by name). Idempotent over the extracted candidate: re-extraction replaces its chapters and clears its judgments (games re-judge against the new book). Refused with 409 when the target was manually edited — a confirmed repertoire never mutates from new games. Each chapter's decision positions seed the training queue as repertoire-line exercises.",
        requestBody: {
          required: true,
          ...jsonOf({
            type: "object",
            properties: {
              color: { type: "string", enum: ["white", "black"] },
              minGames: { type: "integer", minimum: 1, default: 2 },
              maxPlies: { type: "integer", minimum: 2, maximum: 40, default: 12 },
            },
            required: ["color"],
          }),
        },
        responses: {
          "201": {
            description:
              "Extraction outcome (chapters may be 0 when no line reaches minGames)",
            ...jsonOf({
              type: "object",
              properties: {
                status: { type: "string", enum: ["extracted"] },
                repertoireId: { type: "string", format: "uuid" },
                chapters: { type: "integer" },
                gamesConsidered: { type: "integer" },
                seeded: {
                  type: "integer",
                  description: "Decision positions written into the training queue.",
                },
              },
              required: [
                "status",
                "repertoireId",
                "chapters",
                "gamesConsidered",
                "seeded",
              ],
            }),
          },
          "400": { description: "Invalid body", ...errorResponse },
          "409": {
            description:
              "The extraction target is confirmed (manually edited) preparation — delete or rename it to extract fresh",
            ...errorResponse,
          },
        },
      },
    },
    "/repertoires/{id}": {
      get: {
        summary: "A repertoire with its chapters and statistics",
        description:
          "Header, ordered chapters (name, pgn, order — the tree ships on the chapter detail route), and the statistics the shared judgment rows derive: one of five mutually exclusive outcomes per judged game (held, playerLeft, opponentLeft, repertoireEnded, unmatched), adherence, per-chapter rates, the most frequent preparation gaps, and what the unmatched games opened as.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Repertoire header plus ordered chapters (name, pgn)",
            ...jsonOf({
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                name: { type: "string" },
                color: { type: "string", enum: ["white", "black"] },
                source: { type: "string", enum: ["manual", "extracted"] },
                chapters: {
                  type: "array",
                  description:
                    "List rows, deliberately without PGN — the tree ships on the chapter detail route when a chapter is opened.",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                      sortOrder: { type: "integer" },
                      outcomes: { type: "object" },
                      adherenceRate: { type: "number", nullable: true },
                      recallFailures: {
                        type: "integer",
                        description:
                          "Real-game recall failures: the owner left this chapter's line.",
                      },
                      gaps: { type: "integer" },
                      training: {
                        type: "object",
                        properties: {
                          due: { type: "integer" },
                          fresh: { type: "integer" },
                        },
                        required: ["due", "fresh"],
                      },
                    },
                  },
                },
                stats: {
                  type: "object",
                  description:
                    "Derived from judgment rows — never recomputed from games. The outcome vocabulary maps 1:1 onto storage: held=completed, playerLeft=deviation, opponentLeft=gap, repertoireEnded=book-ended.",
                  properties: {
                    matchedGames: { type: "integer" },
                    unmatchedGames: { type: "integer" },
                    outcomes: {
                      type: "object",
                      properties: {
                        held: { type: "integer" },
                        playerLeft: { type: "integer" },
                        opponentLeft: { type: "integer" },
                        repertoireEnded: { type: "integer" },
                        unmatched: { type: "integer" },
                      },
                      required: [
                        "held",
                        "playerLeft",
                        "opponentLeft",
                        "repertoireEnded",
                        "unmatched",
                      ],
                    },
                    adherence: { type: "object", nullable: true },
                    gaps: {
                      type: "array",
                      description:
                        "Opponent moves preparation has no answer to, most frequent first — each with a sample game as evidence. Adding a chapter that covers one is the loop closing; nothing is ever added automatically.",
                      items: {
                        type: "object",
                        properties: {
                          positionKey: { type: "string" },
                          san: { type: "string" },
                          games: { type: "integer" },
                          ply: { type: "integer", nullable: true },
                          sampleGameId: {
                            type: "string",
                            format: "uuid",
                            nullable: true,
                          },
                        },
                      },
                    },
                    uncoveredOpenings: {
                      type: "array",
                      description:
                        "What the unmatched games opened as, by family — the coverage worth adding next.",
                      items: {
                        type: "object",
                        properties: {
                          opening: { type: "string" },
                          games: { type: "integer" },
                        },
                      },
                    },
                  },
                  required: [
                    "matchedGames",
                    "unmatchedGames",
                    "outcomes",
                    "adherence",
                    "gaps",
                    "uncoveredOpenings",
                  ],
                },
              },
              required: ["id", "name", "color", "source", "chapters", "stats"],
            }),
          },
          "400": { description: "Malformed id (not a UUID)", ...errorResponse },
          "404": { description: "Unknown repertoire", ...errorResponse },
        },
      },
      delete: {
        summary: "Delete a repertoire",
        description:
          "Judgment history survives: deviations keep name snapshots and their repertoire link becomes null.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "204": { description: "Deleted" },
          "400": { description: "Malformed id (not a UUID)", ...errorResponse },
          "404": { description: "Unknown repertoire", ...errorResponse },
        },
      },
    },
    "/repertoires/{id}/chapters": {
      post: {
        summary: "Add a PGN chapter to a repertoire",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        requestBody: {
          required: true,
          ...jsonOf({
            type: "object",
            properties: {
              name: { type: "string", minLength: 1 },
              pgn: { type: "string", minLength: 1 },
              sortOrder: { type: "integer", minimum: 0, default: 0 },
            },
            required: ["name", "pgn"],
          }),
        },
        responses: {
          "201": {
            description:
              "Chapter added. Adding confirms an extracted repertoire (extraction stops overwriting it), reopens the judgments a bigger book might answer differently (opponentLeft, repertoireEnded, unmatched — playerLeft evidence stays), and seeds the chapter's decision positions into the training queue.",
            ...jsonOf({
              type: "object",
              properties: {
                status: { type: "string", enum: ["added"] },
                chapter: { type: "object" },
                reopened: { type: "integer" },
                seeded: { type: "integer" },
              },
              required: ["status", "chapter", "reopened", "seeded"],
            }),
          },
          "400": {
            description:
              "Invalid body, malformed id, or a PGN that does not build a repertoire tree",
            ...errorResponse,
          },
          "404": { description: "Unknown repertoire", ...errorResponse },
        },
      },
    },
    "/repertoires/{repertoireId}/chapters/{chapterId}": {
      get: {
        summary: "One chapter, with everything an interactive board needs",
        description:
          "The heavy endpoint by design: the variation tree as plain nested nodes (san, positionKey, comments, nags, children), the decision positions the owner must recall (position, prepared responses, canonical path), and the branches the PGN lost to illegal moves. Lists stay light; this ships when a chapter is opened.",
        parameters: [
          {
            name: "repertoireId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
          {
            name: "chapterId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
        ],
        responses: {
          "200": {
            description: "Chapter content",
            ...jsonOf({
              type: "object",
              properties: {
                id: { type: "string", format: "uuid" },
                repertoireId: { type: "string", format: "uuid" },
                repertoireName: { type: "string" },
                color: { type: "string", enum: ["white", "black"] },
                name: { type: "string" },
                sortOrder: { type: "integer" },
                pgn: { type: "string" },
                start: {
                  type: "object",
                  description:
                    "Where the board opens — already playable, no conversion in the client.",
                  properties: {
                    positionKey: { type: "string" },
                    fen: { type: "string" },
                    isOwnTurn: { type: "boolean" },
                    prepared: { type: "array", items: { type: "object" } },
                  },
                  required: ["positionKey", "fen", "isOwnTurn", "prepared"],
                },
                lines: {
                  type: "array",
                  description:
                    "The chapter in reading order: the mainline first, then each variation as its own line carrying the cursor it replaces ({line, move}) and the labeled trail into it. Every move ships interpreted — label ('2... Nf6'), playable fen, the squares it touched, whose turn it is, and the moves prepared from it with the cursor each lands on. Numbering, PGN order and SAN-to-squares are chess, decided here so a client renders with a map and never re-derives them.",
                  items: {
                    type: "object",
                    properties: {
                      depth: { type: "integer" },
                      branchesFrom: { type: "object", nullable: true },
                      prefix: { type: "array", items: { type: "object" } },
                      moves: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            san: { type: "string" },
                            label: { type: "string" },
                            positionKey: { type: "string" },
                            fen: { type: "string" },
                            from: { type: "string" },
                            to: { type: "string" },
                            ply: { type: "integer" },
                            isOwnTurn: { type: "boolean" },
                            prepared: { type: "array", items: { type: "object" } },
                          },
                        },
                      },
                    },
                  },
                },
                illegalMoves: {
                  type: "array",
                  description:
                    "Authored branches the PGN lost to illegal moves — surfaced, never silently dropped.",
                  items: { type: "object" },
                },
              },
              required: [
                "id",
                "repertoireId",
                "repertoireName",
                "color",
                "name",
                "sortOrder",
                "pgn",
                "start",
                "lines",
                "illegalMoves",
              ],
            }),
          },
          "400": { description: "Malformed id (not a UUID)", ...errorResponse },
          "404": { description: "Unknown chapter", ...errorResponse },
          "422": {
            description: "The stored PGN no longer parses or builds",
            ...errorResponse,
          },
        },
      },
    },
    "/drill/queue": {
      get: {
        summary: "What is waiting to be drilled, before anything is served",
        description:
          "One scope grammar with /drill/next: the same queue, one slice of it, so a chapter's Train button and an insight's CTA count exactly what they will serve.",
        parameters: [
          {
            name: "source",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["repertoire-deviation", "engine-blunder", "repertoire-line"],
            },
            description: "Narrow to one origin.",
          },
          {
            name: "repertoire",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
            description:
              "Narrow to one repertoire's preparation — its chapters' line drills and the deviations judged against it.",
          },
          {
            name: "chapter",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
            description: "Narrow to one chapter.",
          },
        ],
        responses: {
          "200": {
            description: "Counts the drill screen renders a choice from",
            ...jsonOf({
              type: "object",
              properties: {
                due: { type: "integer", description: "Scheduled and past due." },
                fresh: {
                  type: "integer",
                  description: "Seeded but never scheduled — no card yet.",
                },
                byOrigin: {
                  type: "object",
                  description:
                    "The same waiting drills split by what put them there. An exercise carrying both origins counts in both, so these do not sum to due + fresh — they are two piles, not slices of one bar.",
                  properties: {
                    "repertoire-deviation": { type: "integer" },
                    "engine-blunder": { type: "integer" },
                    "repertoire-line": { type: "integer" },
                  },
                  required: ["repertoire-deviation", "engine-blunder", "repertoire-line"],
                },
              },
              required: ["due", "fresh", "byOrigin"],
            }),
          },
        },
      },
    },
    "/drill/next": {
      get: {
        summary: "Next drill: oldest due card, else a new exercise",
        description:
          "Optionally scoped — the same queue /drill/queue counts, one slice of it.",
        parameters: [
          {
            name: "source",
            in: "query",
            required: false,
            schema: {
              type: "string",
              enum: ["repertoire-deviation", "engine-blunder", "repertoire-line"],
            },
            description: "Narrow to one origin.",
          },
          {
            name: "repertoire",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
            description:
              "Narrow to one repertoire's preparation — its chapters' line drills and the deviations judged against it.",
          },
          {
            name: "chapter",
            in: "query",
            required: false,
            schema: { type: "string", format: "uuid" },
            description: "Narrow to one chapter.",
          },
        ],
        responses: {
          "200": {
            description: "The drill to serve",
            ...jsonOf({
              type: "object",
              properties: {
                exerciseId: { type: "string", format: "uuid" },
                fen: { type: "string", description: "Playable FEN for the board" },
                previews: {
                  type: "object",
                  description: "Per-grade preview of the next due date and interval",
                },
                phase: { type: "string", enum: ["due", "new"] },
                context: {
                  type: "object",
                  nullable: true,
                  description:
                    "Why the position is being asked and what it can say about itself. An exercise holding both origins is explained by the repertoire, because that is what expectedSans holds. Null when the provenance is missing.",
                  properties: {
                    origin: {
                      type: "string",
                      enum: ["repertoire-deviation", "engine-blunder", "repertoire-line"],
                    },
                    playedSan: {
                      type: "string",
                      nullable: true,
                      description: "The move you played, to contrast with the answer.",
                    },
                    label: {
                      type: "string",
                      nullable: true,
                      description:
                        "Where it came from, in words: a chapter of your book, or the game and move number.",
                    },
                  },
                  required: ["origin", "playedSan", "label"],
                },
              },
              required: ["exerciseId", "fen", "previews", "phase", "context"],
            }),
          },
          "204": { description: "Nothing to drill" },
        },
      },
    },
    "/drill/answer": {
      post: {
        summary: "Answer an exercise; grades it and schedules the next review",
        requestBody: {
          required: true,
          ...jsonOf({
            type: "object",
            properties: {
              exerciseId: { type: "string", format: "uuid" },
              san: { type: "string", minLength: 1 },
              responseTimeMs: { type: "integer", minimum: 1 },
            },
            required: ["exerciseId", "san"],
          }),
        },
        responses: {
          "200": {
            description: "Grade and next due date",
            ...jsonOf({
              type: "object",
              properties: {
                correct: { type: "boolean" },
                grade: { type: "string" },
                expectedSans: { type: "array", items: { type: "string" } },
                nextDue: { type: "string", format: "date-time" },
              },
              required: ["correct", "grade", "expectedSans", "nextDue"],
            }),
          },
          "400": { description: "Invalid body", ...errorResponse },
          "404": { description: "Unknown exercise", ...errorResponse },
        },
      },
    },
    "/insights": {
      get: {
        summary: "What holds across games, ranked",
        description:
          "Findings rather than tables: each one names a comparison worth making and carries the numbers it was drawn from, biggest measured effect first. Six sources feed one globally ranked list — repertoire adherence, opening weaknesses, phase performance, recurring mistakes, thrown winning positions, and the last-twenty trend. Copy is the client's: a finding carries `kind` and numbers so it can be translated. Empty `findings` is a valid answer and the common one early on — every source stays silent below its evidence floor rather than drawing a confident conclusion from four games — and the envelope's `coverage` says what dataset that silence was drawn from. `section` is presentation taxonomy only; the ranking never reads it, and no source emits `critical` (the critical block is the top of the global ranking, derived by the client).",
        responses: {
          "200": {
            description: "The dataset's coverage, and findings most measured first",
            ...jsonOf({
              type: "object",
              properties: {
                coverage: {
                  type: "object",
                  description:
                    "The dataset behind this request — stated once, and present even when `findings` is empty: how many games were considered and how many of them carry deep analysis.",
                  properties: {
                    gamesConsidered: { type: "integer" },
                    deeplyAnalysedGames: { type: "integer" },
                    coverage: {
                      type: "number",
                      description:
                        "deeplyAnalysedGames / gamesConsidered; 0 over an empty history.",
                    },
                  },
                  required: ["gamesConsidered", "deeplyAnalysedGames", "coverage"],
                },
                findings: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: {
                        type: "string",
                        description: "Stable across runs for unchanged data.",
                      },
                      kind: {
                        type: "string",
                        enum: [
                          "book-advantage",
                          "book-disadvantage",
                          "opening-weakness",
                          "phase-performance",
                          "recurring-mistake",
                          "winning-position-blunders",
                          "performance-trend",
                        ],
                      },
                      section: {
                        type: "string",
                        enum: [
                          "critical",
                          "performance",
                          "phases",
                          "openings",
                          "training",
                        ],
                        description: "Screen grouping only — never a ranking input.",
                      },
                      scope: {
                        type: "string",
                        enum: ["all-games", "analysed-games"],
                        description:
                          "Which evidence tier the finding stands on: facts every imported game carries, or per-move facts only deep analysis produces.",
                      },
                      subject: {
                        type: "object",
                        description:
                          "Adherence kinds only: the repertoire the finding is about.",
                        properties: {
                          repertoireId: { type: "string", format: "uuid" },
                          name: { type: "string" },
                          color: { type: "string", enum: ["white", "black"] },
                        },
                      },
                      evidence: {
                        type: "object",
                        description:
                          "Per-kind numbers the finding was drawn from — counts, rates and the sample sizes behind them, never sentences. The authoritative shapes are the exported types in libs/application/insights/get-insights.",
                      },
                      weight: {
                        type: "number",
                        description:
                          "The measured effect size, 0..1, in the finding's own unit — the ranking key. Units differ by kind (win-rate delta, per-move rate delta, conversion rate); see the source for the honest caveat on comparing them.",
                      },
                    },
                    required: ["id", "kind", "section", "scope", "evidence", "weight"],
                  },
                },
              },
              required: ["coverage", "findings"],
            }),
          },
        },
      },
    },
    "/overview": {
      get: {
        summary: "Per-user counters",
        responses: {
          "200": {
            description: "Overview counts",
            ...jsonOf({
              type: "object",
              properties: {
                games: { type: "integer" },
                deviations: { type: "integer" },
                exercises: { type: "integer" },
                dueCards: { type: "integer" },
              },
              required: ["games", "deviations", "exercises", "dueCards"],
            }),
          },
        },
      },
    },
  },
} as const;
