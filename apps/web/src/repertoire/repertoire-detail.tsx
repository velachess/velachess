import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type { I18n as I18nContext } from "@lingui/core";
import { Link, useParams } from "@tanstack/react-router";

import { Badge } from "@velachess/ui/components/badge";
import { Button } from "@velachess/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@velachess/ui/components/empty";
import { Skeleton } from "@velachess/ui/components/skeleton";
import { PageHeader } from "@velachess/ui/layout/page-header";

import { useQuery } from "../libs/react-query.ts";
import { repertoireQuery, type ChapterRow, type RepertoireBook } from "./queries.ts";

/**
 * A book opened: the chapter list IS the screen. Statistics ride each
 * row in words, not in a KPI grid — a chapter row says what it needs
 * from you (review, gaps, recall failures), and the numbers that
 * describe the whole book stay one quiet line under the title.
 */
const DETAIL_COPY = {
  loadError: msg`Couldn't load this repertoire.`,
  white: msg`White`,
  black: msg`Black`,
  summary: msg`{color} · {chapters, plural, one {# chapter} other {# chapters}}`,
  adherenceSummary: msg`{rate} adherence over {games} judged games · prep runs {depth} moves deep`,
  practiceAll: msg`Practice repertoire`,
  due: msg`{count} due`,
  toPractice: msg`{count} to practice`,
  upToDate: msg`Up to date`,
  adherence: msg`{rate} adherence`,
  untested: msg`no adherence yet`,
  recall: msg`{count, plural, one {# recall failure} other {# recall failures}}`,
  chapterGaps: msg`{count, plural, one {# prep gap} other {# prep gaps}}`,
  emptyTitle: msg`No chapters yet`,
  emptyBody: msg`This repertoire is derived from your games. Sync a few more and its chapters appear here on their own.`,
} as const;

export function RepertoireDetail() {
  const { repertoireId = "" } = useParams({ strict: false });
  return <RepertoireDetailContent key={repertoireId} repertoireId={repertoireId} />;
}

function RepertoireDetailContent({ repertoireId }: { repertoireId: string }) {
  const { i18n } = useLingui();
  const query = useQuery(repertoireQuery(repertoireId));

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <Empty className="m-6 border-0">
        <EmptyHeader>
          <EmptyDescription>{i18n._(DETAIL_COPY.loadError)}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const repertoire = query.data;
  const description = describeBook(i18n, repertoire);
  const waiting = repertoire.chapters.reduce(
    (sum, chapter) => sum + chapter.training.due + chapter.training.fresh,
    0,
  );

  return (
    <>
      <PageHeader title={repertoire.name} description={description} />

      <div className="flex flex-col gap-6 overflow-auto p-6">
        {/* Practice, not the drill screen: this asks you to play your
            own line, where /drill asks you to beat a mistake the engine
            found. Same schedule underneath, different question — so it
            gets its own screen and its own words. */}
        <div>
          <Button
            disabled={waiting === 0}
            render={
              <Link
                to="/repertoire/$repertoireId/practice"
                params={{ repertoireId: repertoire.id }}
              />
            }
          >
            {i18n._(DETAIL_COPY.practiceAll)}
          </Button>
        </div>

        <ChapterList repertoireId={repertoire.id} chapters={repertoire.chapters} />
      </div>
    </>
  );
}

/** One chapter: its name, how it held up, and what it needs from you. */
function ChapterListRow({
  repertoireId,
  chapter,
}: {
  repertoireId: string;
  chapter: ChapterRow;
}) {
  const { i18n } = useLingui();

  const facts: string[] = [];
  if (chapter.adherenceRate !== null) {
    facts.push(
      i18n._({
        ...DETAIL_COPY.adherence,
        values: {
          rate: i18n.number(chapter.adherenceRate, {
            style: "percent",
            maximumFractionDigits: 0,
          }),
        },
      }),
    );
  } else {
    facts.push(i18n._(DETAIL_COPY.untested));
  }
  if (chapter.recallFailures > 0) {
    facts.push(
      i18n._({ ...DETAIL_COPY.recall, values: { count: chapter.recallFailures } }),
    );
  }
  if (chapter.gaps > 0) {
    facts.push(i18n._({ ...DETAIL_COPY.chapterGaps, values: { count: chapter.gaps } }));
  }

  return (
    /*
     * The card is the way into Study, and the only interactive thing on
     * it: the chapter's name is a link stretched over the whole card
     * with `after:absolute after:inset-0`. Everything to its right is
     * status, not an action — a second button here competed with the
     * card for the same click and made the row's target ambiguous.
     * Practising one chapter is offered from inside it, where the person
     * has just seen what they would be practising.
     */
    <div className="border-border bg-card hover:border-primary/60 focus-within:border-primary/60 relative flex items-center gap-4 rounded-lg border p-4 transition-colors">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-medium">
          <Link
            to="/repertoire/$repertoireId/$chapterId"
            params={{ repertoireId, chapterId: chapter.id }}
            className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none"
          >
            {chapter.name}
          </Link>
        </h3>
        <p className="text-muted-foreground text-sm">{facts.join(" · ")}</p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <TrainingBadge training={chapter.training} />
      </div>
    </div>
  );
}

/** The opponent-left loop's surface: what to prepare next, as a quiet
 * secondary list — never a move added automatically. */
/**
 * What the book's title line says: how faithfully it was played once
 * games have been judged against it, and what it is before that.
 *
 * A function rather than a ternary in the JSX — the two sentences are
 * different claims, and each reads as itself here.
 */
function describeBook(i18n: I18nContext, repertoire: RepertoireBook): string {
  const { adherence } = repertoire.stats;

  if (!adherence) {
    const color = i18n._(
      repertoire.color === "white" ? DETAIL_COPY.white : DETAIL_COPY.black,
    );
    return i18n._({
      ...DETAIL_COPY.summary,
      values: { color, chapters: repertoire.chapters.length },
    });
  }

  return i18n._({
    ...DETAIL_COPY.adherenceSummary,
    values: {
      rate: i18n.number(adherence.adherenceRate, {
        style: "percent",
        maximumFractionDigits: 0,
      }),
      games: i18n.number(adherence.judgedGames),
      // Plies are half-moves; people count whole ones.
      depth: i18n.number(Math.round(adherence.averagePrepDepth / 2)),
    },
  });
}

/**
 * Three states, three meanings, three colours — and the colour carries
 * the meaning rather than the brand.
 *
 *   due       warning   overdue: this is what you came back for
 *   to practice  info   never asked yet — new material, not a problem
 *   up to date success  everything here is scheduled for later
 *
 * Due outranks never-practised. Nothing waiting used to render nothing,
 * which read as missing data on a row that was in fact the healthiest
 * one; "Up to date" says so. Neither waiting state is called "new" —
 * that would claim the positions were just created, when the truth is
 * they were never asked.
 */
function TrainingBadge({ training }: { training: ChapterRow["training"] }) {
  const { i18n } = useLingui();

  if (training.due > 0) {
    return (
      <Badge variant="warning">
        {i18n._({ ...DETAIL_COPY.due, values: { count: training.due } })}
      </Badge>
    );
  }
  if (training.fresh > 0) {
    return (
      <Badge variant="info">
        {i18n._({ ...DETAIL_COPY.toPractice, values: { count: training.fresh } })}
      </Badge>
    );
  }
  return <Badge variant="success">{i18n._(DETAIL_COPY.upToDate)}</Badge>;
}

/** The chapters, or the sentence that explains their absence. */
function ChapterList({
  repertoireId,
  chapters,
}: {
  repertoireId: string;
  chapters: ChapterRow[];
}) {
  const { i18n } = useLingui();

  if (chapters.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>{i18n._(DETAIL_COPY.emptyTitle)}</EmptyTitle>
          <EmptyDescription>{i18n._(DETAIL_COPY.emptyBody)}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {chapters.map((chapter) => (
        <li key={chapter.id}>
          <ChapterListRow repertoireId={repertoireId} chapter={chapter} />
        </li>
      ))}
    </ul>
  );
}
