/** Pure: every localisation is the screen's, needing an i18n instance. */
import { PAGE_SIZE } from "./filters.ts";

/**
 * From the clock, not the platform's label, which Lichess and chess.com
 * word differently for the same game.
 */
export function formatClock(
  initialSeconds: number | null,
  incrementSeconds: number | null,
) {
  if (initialSeconds === null) return null;

  const minutes = initialSeconds / 60;
  const base = Number.isInteger(minutes) ? `${minutes} min` : `${initialSeconds}s`;
  return incrementSeconds ? `${base} + ${incrementSeconds}` : base;
}

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
