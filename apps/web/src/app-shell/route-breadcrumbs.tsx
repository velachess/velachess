import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Link, useMatches } from "@tanstack/react-router";
import { Fragment } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@velachess/ui/components/breadcrumb";

const BREADCRUMB_COPY = {
  label: msg`Breadcrumb`,
} as const;

interface Crumb {
  label: MessageDescriptor;
  fullPath: string;
  params: Record<string, string>;
}

/** The matched routes' `crumb`s, outermost first: ancestors link back, the
 * deepest names this page. */
export function RouteBreadcrumbs() {
  const { i18n } = useLingui();
  const crumbs = useMatches().flatMap((match): Crumb[] => {
    const label = match.staticData.crumb;
    if (!label) return [];
    return [{ label, fullPath: match.fullPath, params: match.params }];
  });
  const ancestors = crumbs.slice(0, -1);
  const current = crumbs.at(-1);

  return (
    <Breadcrumb aria-label={i18n._(BREADCRUMB_COPY.label)}>
      <BreadcrumbList>
        {ancestors.map((crumb) => (
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
        {current && (
          <BreadcrumbItem>
            <BreadcrumbPage>{i18n._(current.label)}</BreadcrumbPage>
          </BreadcrumbItem>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
