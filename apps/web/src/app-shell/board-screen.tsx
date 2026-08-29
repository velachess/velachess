import { useLingui } from "@lingui/react";
import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@velachess/ui/components/breadcrumb";
import { BoardStage } from "@velachess/ui/chess/board-stage";

import { useBreadcrumbTrail } from "./breadcrumb-trail.ts";

export interface BoardScreenProps {
  /** The page's own name — the last crumb, which the router cannot know
   * because it needs data the route hasn't loaded. */
  page: string;
  /** Extra classes for the page crumb — truncation on narrow screens, for instance. */
  pageClassName?: string;
  /** Crumbs between the router's trail and this page, as
   * `<BreadcrumbItem>`s — a chapter's repertoire, for instance. */
  crumbs?: ReactNode;
  /** The board column and its context panel, in that order. */
  children: ReactNode;
}

/**
 * The frame every board screen shares: a breadcrumb that stays put, and
 * a board beside its context panel below it.
 *
 * Game Review, Repertoire Study and Repertoire Practice are three
 * questions about one position — what happened, what is prepared, can I
 * recall it — and a person who learns to read one should recognise the
 * next. So the scroll boundary, the trail and the two-column stage are
 * decided here once; each screen brings only its own two children.
 */
export function BoardScreen({ page, pageClassName, crumbs, children }: BoardScreenProps) {
  const { i18n } = useLingui();
  const trail = useBreadcrumbTrail();

  return (
    // The scroll/overflow boundary sits here so the breadcrumb stays
    // above it; the stage below keeps its own height tuning.
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4 lg:overflow-hidden">
      <Breadcrumb className="shrink-0">
        <BreadcrumbList>
          {trail.map((crumb) => (
            <Fragment key={crumb.fullPath}>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={
                    <Link to={crumb.fullPath} params={crumb.params}>
                      {i18n._(crumb.label)}
                    </Link>
                  }
                />
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </Fragment>
          ))}
          {crumbs}
          <BreadcrumbItem>
            <BreadcrumbPage className={pageClassName}>{page}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <BoardStage>{children}</BoardStage>
    </div>
  );
}
