import type { SQL } from "drizzle-orm";
import type { PgColumn, PgSelect } from "drizzle-orm/pg-core";

/**
 * Offset pagination as one reusable `.$dynamic()` clause, so the offset
 * arithmetic lives in one place. `orderBy` is required — LIMIT without a
 * total order lets rows repeat or vanish across pages.
 */
export function withPagination<T extends PgSelect>(
  query: T,
  orderBy: PgColumn | SQL | SQL.Aliased,
  page: number,
  pageSize: number,
) {
  return query
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);
}

export interface Paginated<TRow> {
  rows: TRow[];
  /** Rows matching the filters, ignoring the page. */
  total: number;
  page: number;
  pageSize: number;
}
