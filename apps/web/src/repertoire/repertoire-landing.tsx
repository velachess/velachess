import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { I18n as I18nContext, MessageDescriptor } from "@lingui/core";
import { Link } from "@tanstack/react-router";

import { Empty, EmptyDescription, EmptyHeader } from "@velachess/ui/components/empty";
import { Skeleton } from "@velachess/ui/components/skeleton";
import { PageHeader } from "@velachess/ui/layout/page-header";

import { useQuery } from "../libs/react-query.ts";
import {
  repertoireOfColor,
  repertoiresQuery,
  type RepertoireSummary,
} from "./queries.ts";

/**
 * The landing: two cards, White and Black, and nothing else to decide.
 *
 * The books are derived from the games — the sync pipeline grows a
 * candidate for a color the moment there is something to derive one
 * from — so there is nothing here to create and no button to press.
 * Each card IS the link: it says how the side stands and opens it, where
 * studying and training live.
 */
const LANDING_COPY = {
  title: msg`Repertoire`,
  description: msg`What you intend to play, and how well you know it.`,
  loadError: msg`Couldn't load your repertoire.`,
  white: msg`White repertoire`,
  black: msg`Black repertoire`,
  chapters: msg`{count, plural, one {# chapter} other {# chapters}}`,
  adherence: msg`{rate} adherence over {games} judged games`,
  notJudged: msg`No games judged against it yet`,
  due: msg`{count, plural, one {# position due} other {# positions due}}`,
  fresh: msg`{count, plural, one {# position} other {# positions}} to practice`,
  nothingDue: msg`Nothing waiting`,
  gaps: msg`{count, plural, one {# prep gap} other {# prep gaps}}`,
  building: msg`Built from your games`,
  buildingBody: msg`This side has no lines yet. Sync a few more games and the repertoire appears here on its own — nothing to set up.`,
} as const;

const GRID = "grid gap-4 md:grid-cols-2";

export function RepertoireLanding() {
  const { i18n } = useLingui();

  return (
    <>
      <PageHeader
        title={i18n._(LANDING_COPY.title)}
        description={i18n._(LANDING_COPY.description)}
      />
      <div className="flex flex-col gap-4 overflow-auto p-6">
        <Cards />
      </div>
    </>
  );
}

/** Three outcomes, read top to bottom — the pair of cards is the last
 * and the only one with anything to decide. */
function Cards() {
  const { i18n } = useLingui();
  const query = useQuery(repertoiresQuery);

  if (query.isPending) {
    return (
      <div className={GRID}>
        <Skeleton className="h-52 w-full" />
        <Skeleton className="h-52 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyDescription>{i18n._(LANDING_COPY.loadError)}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className={GRID}>
      <ColorCard color="white" repertoires={query.data} />
      <ColorCard color="black" repertoires={query.data} />
    </div>
  );
}

const COLOR_LABEL: Record<"white" | "black", MessageDescriptor> = {
  white: LANDING_COPY.white,
  black: LANDING_COPY.black,
};

const CARD = "bg-card flex min-h-52 flex-col gap-4 rounded-xl border p-5";

function ColorCard({
  color,
  repertoires,
}: {
  color: "white" | "black";
  repertoires: RepertoireSummary[];
}) {
  const { i18n } = useLingui();
  const repertoire = repertoireOfColor(repertoires, color);
  const label = i18n._(COLOR_LABEL[color]);

  const heading = (
    <header className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={
          color === "white"
            ? "size-3 rounded-full border bg-white"
            : "size-3 rounded-full border bg-zinc-900"
        }
      />
      <h2 className="text-lg font-semibold">{label}</h2>
    </header>
  );

  // Nothing derived yet: the card stays — the pair is the product's top
  // level — and says what will fill it, rather than offering a control
  // that would make the person responsible for the derivation.
  if (!repertoire) {
    return (
      <section aria-label={label} className={CARD}>
        {heading}
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">{i18n._(LANDING_COPY.building)}</p>
          <p className="text-muted-foreground text-sm">
            {i18n._(LANDING_COPY.buildingBody)}
          </p>
        </div>
      </section>
    );
  }

  // The whole card is the way in — one target, no competing buttons, and
  // the same destination whether the person means to study or to train.
  return (
    <Link
      to="/repertoire/$repertoireId"
      params={{ repertoireId: repertoire.id }}
      aria-label={label}
      className={`${CARD} hover:border-primary/60 focus-visible:ring-ring/50 transition-colors focus-visible:ring-[3px] focus-visible:outline-none`}
    >
      {heading}
      <RepertoireFacts repertoire={repertoire} />
    </Link>
  );
}

/** How the side stands, in sentences — statistics stay secondary. */
function RepertoireFacts({ repertoire }: { repertoire: RepertoireSummary }) {
  const { i18n } = useLingui();

  const adherenceLine = describeAdherence(i18n, repertoire.adherence);

  const waitingLine = describeWaiting(i18n, repertoire.training);

  return (
    <div className="text-muted-foreground flex flex-col gap-1 text-sm">
      <span>
        {i18n._({
          ...LANDING_COPY.chapters,
          values: { count: repertoire.chapterCount },
        })}
      </span>
      <span>{adherenceLine}</span>
      <span className="text-foreground">{waitingLine}</span>
      {repertoire.gaps > 0 && (
        <span>
          {i18n._({ ...LANDING_COPY.gaps, values: { count: repertoire.gaps } })}
        </span>
      )}
    </div>
  );
}

/** Due first — overdue is what a person came back for. */
function describeWaiting(
  i18n: I18nContext,
  training: RepertoireSummary["training"],
): string {
  if (training.due > 0) {
    return i18n._({ ...LANDING_COPY.due, values: { count: training.due } });
  }
  if (training.fresh > 0) {
    return i18n._({ ...LANDING_COPY.fresh, values: { count: training.fresh } });
  }
  return i18n._(LANDING_COPY.nothingDue);
}

/** Null adherence is "nothing judged yet", which is not zero percent. */
function describeAdherence(
  i18n: I18nContext,
  adherence: RepertoireSummary["adherence"],
): string {
  if (!adherence) return i18n._(LANDING_COPY.notJudged);

  return i18n._({
    ...LANDING_COPY.adherence,
    values: {
      rate: i18n.number(adherence.adherenceRate, {
        style: "percent",
        maximumFractionDigits: 0,
      }),
      games: i18n.number(adherence.judgedGames),
    },
  });
}
