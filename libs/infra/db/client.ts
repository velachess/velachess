import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.ts";

export { schema };

/** Driver-agnostic on purpose: the pg-core supertype that postgres-js and
 * PGlite drizzle instances — and Drizzle transactions — all extend. Queries
 * accept any of them without casts. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Every caller constructs explicitly from a validated URL at startup —
 * no module-scope singleton, so importing this package never opens a
 * connection as a side effect. */
export function createDb(url: string): Database {
  return drizzle(postgres(url), { schema });
}
