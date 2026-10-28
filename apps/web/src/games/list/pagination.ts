import { PAGE_SIZE } from "./filters.ts";

/** Consecutive pages around the current one; both ends always show. */
const WINDOW_PAGES = 3;

/** A gap names the page it follows, so a skip has a key of its own rather
 * than borrowing its position in the row. */
export type PageSlot = number | `gap-${number}`;

export function lastPageOf(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export function pageSlots(page: number, lastPage: number): PageSlot[] {
  const start = Math.min(Math.max(page - 1, 1), Math.max(lastPage - WINDOW_PAGES + 1, 1));
  const window = Array.from(
    { length: Math.min(WINDOW_PAGES, lastPage - start + 1) },
    (_, index) => start + index,
  );
  const pages = [...new Set([1, ...window, lastPage])].toSorted((a, b) => a - b);

  return pages.flatMap((value, index) => {
    const previous = pages[index - 1];
    if (previous === undefined || value - previous === 1) return [value];
    return [`gap-${previous}` as const, value];
  });
}
