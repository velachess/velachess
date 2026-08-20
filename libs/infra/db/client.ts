/**
 * Module-scope singleton — created once, held for the process lifetime.
 * Right for a long-lived Node process (a future MCP server, this repo's
 * apps/web on the Node.js runtime). If a genuinely different runtime
 * profile shows up later (an edge route, a worker wanting its own tuned
 * pool), build a second client from the exported `schema` — don't fork it.
 */

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.ts";

export { schema };

export const db = drizzle(postgres(process.env["DATABASE_URL"]!), { schema });

/** Driver-agnostic on purpose: the pg-core supertype that postgres-js and
 * PGlite drizzle instances — and Drizzle transactions — all extend. Queries
 * accept any of them without casts. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Explicit factory — for callers that manage their own connection lifecycle
 * (apps constructing from env at startup, tests, future second runtimes). */
export function createDb(url: string): Database {
  return drizzle(postgres(url), { schema });
}
