import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type * as React from "react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@velachess/ui/components/empty";
import { Skeleton } from "@velachess/ui/components/skeleton";
import { PageHeader } from "@velachess/ui/layout/page-header";

import { useQuery } from "../shared/libs/query/index.ts";
import { FindingView, isRenderable } from "./finding-views.tsx";
import { insightsQuery } from "./queries.ts";
import type { Finding } from "./queries.ts";

/**
 * What your games are telling you to prioritize.
 *
 * The screen is an editorial page over one ranked list, not a dashboard:
 * the top of the global ranking opens it — the single most measured
 * finding at full size, the next two beside it — and only what remains
 * falls into its section below. `Critical` is therefore not a source:
 * it is a position in the ranking, which is exactly how the API means
 * `weight` to be read.
 *
 * Sections render only when they have findings. There is no "Phases"
 * heading over an empty box and no KPI row above the fold: a section
 * that always says the same thing teaches people to stop reading the
 * screen, and a number without a comparison is a dashboard's job — the
 * one this screen exists not to do.
 *
 * No filters yet, deliberately: `GET /insights` takes no parameters, and
 * a period/platform dropdown that filtered nothing would be a control
 * that lies. Filters arrive with the query params that honor them.
 */
const INSIGHTS_COPY = {
  title: msg`Insights`,
  description: msg`What your games are telling you to prioritize.`,
  emptyTitle: msg`Nothing worth saying yet`,
  emptyBody: msg`A finding needs enough games to be more than chance: results and openings speak after a few dozen games, mistake patterns after a handful of analysed ones, book findings once games are judged against a repertoire. Sync, analyse a few, and the first one shows up here.`,
  emptyCoverage: msg`Right now: {games} games imported, {analysed} deeply analysed.`,
  loadError: msg`Couldn't load insights.`,
  sections: {
    critical: msg`Start here`,
    performance: msg`Performance`,
    phases: msg`Game phases`,
    openings: msg`Openings`,
    training: msg`Training`,
  },
} as const;

/** How many of the top-ranked findings open the page. */
const CRITICAL_COUNT = 3;

/** Presentation order for what is not critical. */
const SECTION_ORDER = ["performance", "phases", "openings", "training"] as const;

const GRID = "grid gap-4 @4xl/content:grid-cols-2";

export function Insights() {
  const { i18n } = useLingui();

  return (
    <>
      <PageHeader
        title={i18n._(INSIGHTS_COPY.title)}
        description={i18n._(INSIGHTS_COPY.description)}
      />

      <div className="flex flex-col gap-8 overflow-auto p-6">
        <Findings />
      </div>
    </>
  );
}

/** Four outcomes, read top to bottom: local failure, not yet, nothing to
 * say, and the findings themselves. Infrastructure failure is global. */
function Findings() {
  const { i18n } = useLingui();
  const query = useQuery(insightsQuery);

  // The shape of the answer: one full-width block and a pair below it.
  // Matching the loaded layout is what keeps the page from reflowing
  // when the data lands.
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-72 w-full" />
        <div className={GRID}>
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyDescription>{i18n._(INSIGHTS_COPY.loadError)}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  // Kinds this build cannot draw are skipped, never crashed on — the API
  // is allowed to be ahead of the screen.
  const { coverage } = query.data;
  const findings = query.data.findings.filter(isRenderable);

  if (findings.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>{i18n._(INSIGHTS_COPY.emptyTitle)}</EmptyTitle>
          <EmptyDescription>{i18n._(INSIGHTS_COPY.emptyBody)}</EmptyDescription>
          {/* The dataset the silence was drawn from — what separates
              "import something" from "analyse what you imported". */}
          {coverage.gamesConsidered > 0 && (
            <EmptyDescription>
              {i18n._({
                ...INSIGHTS_COPY.emptyCoverage,
                values: {
                  games: i18n.number(coverage.gamesConsidered),
                  analysed: i18n.number(coverage.deeplyAnalysedGames),
                },
              })}
            </EmptyDescription>
          )}
        </EmptyHeader>
      </Empty>
    );
  }

  // Server order, untouched: the ranking is a decision made where it can
  // be tested, and re-sorting here would be a second opinion. The page
  // only decides where the ranking's head and tail live.
  const critical = findings.slice(0, CRITICAL_COUNT);
  const rest = findings.slice(CRITICAL_COUNT);
  const sections = SECTION_ORDER.map((section) => ({
    section,
    items: rest.filter((finding) => finding.section === section),
  })).filter(({ items }) => items.length > 0);

  // The heading earns its place only when something follows it — over
  // the whole page it would label everything and say nothing.
  const criticalTitle =
    sections.length > 0 ? i18n._(INSIGHTS_COPY.sections.critical) : null;

  return (
    <>
      <FindingSection title={criticalTitle}>
        <CriticalFindings findings={critical} />
      </FindingSection>

      {sections.map(({ section, items }) => (
        <FindingSection key={section} title={i18n._(INSIGHTS_COPY.sections[section])}>
          <div className={GRID}>
            {items.map((finding) => (
              <FindingView key={finding.id} finding={finding} />
            ))}
          </div>
        </FindingSection>
      ))}
    </>
  );
}

/** The head of the ranking: the first finding at full width and full
 * voice, the runners-up beside each other under it. */
function CriticalFindings({ findings }: { findings: Finding[] }) {
  const [primary, ...secondary] = findings;
  if (!primary) return null;

  return (
    <div className="flex flex-col gap-4">
      <FindingView finding={primary} emphasis="hero" />
      {secondary.length > 0 && (
        <div className={GRID}>
          {secondary.map((finding) => (
            <FindingView key={finding.id} finding={finding} />
          ))}
        </div>
      )}
    </div>
  );
}

function FindingSection({
  title,
  children,
}: {
  title: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      {title !== null && (
        <h2 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}
