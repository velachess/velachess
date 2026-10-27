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
  /** The last crumb, which the router cannot know: it needs data the route
   * has not loaded. */
  page: ReactNode;
  children: ReactNode;
}

export function BoardScreen({ page, children }: BoardScreenProps) {
  const { i18n } = useLingui();
  const trail = useBreadcrumbTrail();

  return (
    // `pb-0` on mobile: a sticky footer nav inside the panel sticks to this
    // container's padding edge.
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4 pb-0 @4xl/content:overflow-hidden @4xl/content:pb-4">
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
          <BreadcrumbItem>
            <BreadcrumbPage>{page}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <BoardStage>{children}</BoardStage>
    </div>
  );
}
