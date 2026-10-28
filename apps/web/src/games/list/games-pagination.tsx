import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { createLink } from "@tanstack/react-router";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@velachess/ui/components/pagination";

import { PAGE_SIZE } from "./filters.ts";

const PAGINATION_COPY = {
  label: msg`Games pages`,
  previous: msg`Previous`,
  next: msg`Next`,
  previousPage: msg`Go to previous page`,
  nextPage: msg`Go to next page`,
  page: msg`Go to page {page}`,
  summary: msg`{first}–{last} of {total} games`,
  range: msg`{first}–{last} of {total}`,
  position: msg`{page} / {lastPage}`,
} as const;

const WINDOW_PAGES = 3;

export type PageSlot = number | "gap";

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
    const skipped = previous !== undefined && value - previous > 1;
    return skipped ? ["gap" as const, value] : [value];
  });
}

const PageLink = createLink(PaginationLink);
const PreviousLink = createLink(PaginationPrevious);
const NextLink = createLink(PaginationNext);

/** Kept in place rather than dropped: the controls must not shift under
 * the cursor at the ends. */
const AT_BOUNDARY = "pointer-events-none opacity-50";

export interface GamesPaginationProps {
  total: number;
  page: number;
  onNavigate: () => void;
}

export function GamesPagination({ total, page, onNavigate }: GamesPaginationProps) {
  const { i18n } = useLingui();
  const lastPage = lastPageOf(total);
  const first = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const counts = {
    first: i18n.number(first),
    last: i18n.number(last),
    total: i18n.number(total),
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <span className="text-sm text-muted-foreground">
        <span className="hidden sm:inline">
          {i18n._({ ...PAGINATION_COPY.summary, values: counts })}
        </span>
        <span className="sm:hidden">
          {i18n._({ ...PAGINATION_COPY.range, values: counts })}
        </span>
      </span>

      <Pagination aria-label={i18n._(PAGINATION_COPY.label)} className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            {page > 1 && (
              <PreviousLink
                to="/games"
                search={(previous) => ({ ...previous, page: page - 1 })}
                onClick={onNavigate}
                aria-label={i18n._(PAGINATION_COPY.previousPage)}
                text={i18n._(PAGINATION_COPY.previous)}
              />
            )}
            {page <= 1 && (
              <PaginationPrevious
                aria-disabled
                className={AT_BOUNDARY}
                aria-label={i18n._(PAGINATION_COPY.previousPage)}
                text={i18n._(PAGINATION_COPY.previous)}
              />
            )}
          </PaginationItem>

          {pageSlots(page, lastPage).map((slot, index) => (
            <PaginationItem
              key={slot === "gap" ? `gap-${index}` : slot}
              className="hidden sm:block"
            >
              {slot === "gap" && <PaginationEllipsis />}
              {slot !== "gap" && (
                <PageLink
                  to="/games"
                  search={(previous) => ({ ...previous, page: slot })}
                  onClick={onNavigate}
                  isActive={slot === page}
                  aria-label={i18n._({
                    ...PAGINATION_COPY.page,
                    values: { page: i18n.number(slot) },
                  })}
                >
                  {i18n.number(slot)}
                </PageLink>
              )}
            </PaginationItem>
          ))}

          <PaginationItem className="px-2 text-sm text-muted-foreground tabular-nums sm:hidden">
            {i18n._({
              ...PAGINATION_COPY.position,
              values: { page: i18n.number(page), lastPage: i18n.number(lastPage) },
            })}
          </PaginationItem>

          <PaginationItem>
            {page < lastPage && (
              <NextLink
                to="/games"
                search={(previous) => ({ ...previous, page: page + 1 })}
                onClick={onNavigate}
                aria-label={i18n._(PAGINATION_COPY.nextPage)}
                text={i18n._(PAGINATION_COPY.next)}
              />
            )}
            {page >= lastPage && (
              <PaginationNext
                aria-disabled
                className={AT_BOUNDARY}
                aria-label={i18n._(PAGINATION_COPY.nextPage)}
                text={i18n._(PAGINATION_COPY.next)}
              />
            )}
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
