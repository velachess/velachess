import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Link } from "@tanstack/react-router";

import { Button } from "@velachess/ui/components/button";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@velachess/ui/components/progress";

import { FindingBlock } from "./finding-block.tsx";
import type { Finding } from "./queries.ts";

/**
 * One adapter per kind: evidence in, sentences out, all through the one
 * `FindingBlock` shape. This file owns every word on the screen — a
 * finding carries numbers precisely so that copy stays here, where
 * Lingui can reach it.
 *
 * A kind without an adapter renders nothing. That is the forward
 * contract with the API: a new source ships findings before the screen
 * learns to draw them, and skipping is better than a card whose numbers
 * the wrong adapter would misread.
 */

type FindingOf<K extends Finding["kind"]> = Extract<Finding, { kind: K }>;

export interface FindingViewProps {
  finding: Finding;
  emphasis?: "hero" | "standard";
}

export function FindingView({ finding, emphasis = "standard" }: FindingViewProps) {
  switch (finding.kind) {
    case "book-advantage":
    case "book-disadvantage":
      return <AdherenceView finding={finding} emphasis={emphasis} />;
    case "opening-weakness":
      return <OpeningWeaknessView finding={finding} emphasis={emphasis} />;
    case "phase-performance":
      return <PhasePerformanceView finding={finding} emphasis={emphasis} />;
    case "recurring-mistake":
      return <RecurringMistakeView finding={finding} emphasis={emphasis} />;
    case "winning-position-blunders":
      return <ConversionView finding={finding} emphasis={emphasis} />;
    case "performance-trend":
      return <TrendView finding={finding} emphasis={emphasis} />;
    default:
      return null;
  }
}

/** Whether the screen knows how to draw this finding at all. */
export function isRenderable(finding: Finding): boolean {
  return RENDERABLE.has(finding.kind);
}

const RENDERABLE = new Set<Finding["kind"]>([
  "book-advantage",
  "book-disadvantage",
  "opening-weakness",
  "phase-performance",
  "recurring-mistake",
  "winning-position-blunders",
  "performance-trend",
]);

function usePercent() {
  const { i18n } = useLingui();
  return (share: number) =>
    i18n.number(share, { style: "percent", maximumFractionDigits: 0 });
}

const PHASE_COPY = {
  opening: msg`opening`,
  middlegame: msg`middlegame`,
  endgame: msg`endgame`,
} as const;

/* ------------------------------------------------------------------ */
/* Adherence — the two book directions, ported intact from the first   */
/* version of this screen: headline table, two bars, context line.     */
/* ------------------------------------------------------------------ */

const ADHERENCE_COPY = {
  headline: {
    "book-advantage": {
      white: msg`Your preparation is paying off with White`,
      black: msg`Your preparation is paying off with Black`,
    },
    "book-disadvantage": {
      white: msg`You score better when you leave your White book`,
      black: msg`You score better when you leave your Black book`,
    },
  },
  action: {
    "book-advantage": msg`Train the moves you missed`,
    "book-disadvantage": msg`Look at these games`,
  },
  inBook: msg`Followed the book`,
  outOfBook: msg`Left the book`,
  value: msg`{rate} of {count, plural, one {# game} other {# games}}`,
  spokenValue: msg`won {rate} of {count, plural, one {# game} other {# games}}`,
  context: msg`You followed it in {adherence} of {judged} judged games, and it runs about {depth} moves deep.`,
} as const;

/**
 * Where an adherence finding sends you, which is not the same place for
 * the two directions: a book that is paying off is worth drilling, and
 * one you score worse inside is worth looking at rather than practising.
 */
function AdherenceAction({
  kind,
  color,
}: {
  kind: "book-advantage" | "book-disadvantage";
  color: "white" | "black";
}) {
  const { i18n } = useLingui();

  if (kind === "book-advantage") {
    return (
      <Button render={<Link to="/drill" />}>{i18n._(ADHERENCE_COPY.action[kind])}</Button>
    );
  }

  // Narrowed to the colour the finding is about, so the link lands on
  // the games it was drawn from rather than the whole archive.
  return (
    <Button render={<Link to="/games" search={{ color }} />}>
      {i18n._(ADHERENCE_COPY.action[kind])}
    </Button>
  );
}

function AdherenceView({
  finding,
  emphasis,
}: {
  finding: FindingOf<"book-advantage" | "book-disadvantage">;
  emphasis: "hero" | "standard";
}) {
  const { i18n } = useLingui();
  const percent = usePercent();
  const { kind, subject, evidence } = finding;

  const sides = [
    {
      key: "in-book",
      label: i18n._(ADHERENCE_COPY.inBook),
      share: evidence.inBookWinRate,
      count: evidence.inBookGames,
    },
    {
      key: "out-of-book",
      label: i18n._(ADHERENCE_COPY.outOfBook),
      share: evidence.outOfBookWinRate,
      count: evidence.outOfBookGames,
    },
  ];

  const action = <AdherenceAction kind={kind} color={subject.color} />;

  return (
    <FindingBlock
      emphasis={emphasis}
      eyebrow={subject.name}
      headline={i18n._(ADHERENCE_COPY.headline[kind][subject.color])}
      evidence={i18n._({
        ...ADHERENCE_COPY.context,
        values: {
          adherence: percent(evidence.adherenceRate),
          judged: i18n.number(evidence.judgedGames),
          depth: i18n.number(movesIn(evidence.averagePrepDepth)),
        },
      })}
      action={action}
    >
      {/* Two bars, one colour: which side is the good one depends on the
          finding, and painting them differently would state a verdict the
          numbers have not reached. */}
      <div className="flex flex-col gap-4">
        {sides.map(({ key, label, share, count }) => (
          <Progress
            key={key}
            value={Math.round(share * 100)}
            getAriaValueText={() =>
              i18n._({
                ...ADHERENCE_COPY.spokenValue,
                values: { rate: percent(share), count },
              })
            }
          >
            <ProgressLabel>{label}</ProgressLabel>
            <ProgressValue>
              {() =>
                i18n._({
                  ...ADHERENCE_COPY.value,
                  values: { rate: percent(share), count },
                })
              }
            </ProgressValue>
          </Progress>
        ))}
      </div>
    </FindingBlock>
  );
}

/**
 * An average depth in plies, as a person reads it: nine plies is four
 * and a half moves — "about five". Rounds a mean, never a single ply.
 */
function movesIn(plies: number): number {
  return Math.max(1, Math.round(plies / 2));
}

/* ------------------------------------------------------------------ */
/* Opening weakness                                                     */
/* ------------------------------------------------------------------ */

const OPENING_COPY = {
  headline: msg`{opening} is costing you points`,
  interpretation: msg`You win {rate} of your games in it, against {baseline} across everything you play.`,
  evidence: msg`{games, plural, one {# decided game} other {# decided games}} in this opening, measured against {baselineGames} overall.`,
  action: msg`View games`,
} as const;

function OpeningWeaknessView({
  finding,
  emphasis,
}: {
  finding: FindingOf<"opening-weakness">;
  emphasis: "hero" | "standard";
}) {
  const { i18n } = useLingui();
  const percent = usePercent();
  const { evidence } = finding;

  return (
    <FindingBlock
      emphasis={emphasis}
      eyebrow={evidence.openingEco ?? undefined}
      headline={i18n._({
        ...OPENING_COPY.headline,
        values: { opening: evidence.openingName },
      })}
      interpretation={i18n._({
        ...OPENING_COPY.interpretation,
        values: {
          rate: percent(evidence.winRate),
          baseline: percent(evidence.baselineWinRate),
        },
      })}
      evidence={i18n._({
        ...OPENING_COPY.evidence,
        values: {
          games: evidence.games,
          baselineGames: i18n.number(evidence.baselineGames),
        },
      })}
      // Unscoped until the games list can filter by opening — a plain
      // archive link is weak, a link that pretended to filter would lie.
      action={
        <Button variant="outline" render={<Link to="/games" />}>
          {i18n._(OPENING_COPY.action)}
        </Button>
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* Phase performance                                                    */
/* ------------------------------------------------------------------ */

const PHASE_PERF_COPY = {
  weakness: msg`Your {phase} is where the mistakes concentrate`,
  strength: msg`Your {phase} is your most solid stretch`,
  interpretation: msg`You err on {rate} of your {phase} moves, against {overall} across the whole game.`,
  evidence: msg`{moves} of your moves there, over {games, plural, one {# analysed game} other {# analysed games}}.`,
  breakdown: msg`Compare all phases`,
  phaseRow: msg`{errors} errors in {moves} moves`,
  phaseThin: msg`too few moves to judge`,
  action: msg`Train this`,
} as const;

function PhasePerformanceView({
  finding,
  emphasis,
}: {
  finding: FindingOf<"phase-performance">;
  emphasis: "hero" | "standard";
}) {
  const { i18n } = useLingui();
  const percent = usePercent();
  const { evidence } = finding;

  const weakness = evidence.errorRate > evidence.overallErrorRate;
  const headline = weakness ? PHASE_PERF_COPY.weakness : PHASE_PERF_COPY.strength;

  return (
    <FindingBlock
      emphasis={emphasis}
      headline={i18n._({
        ...headline,
        values: { phase: i18n._(PHASE_COPY[evidence.phase]) },
      })}
      interpretation={i18n._({
        ...PHASE_PERF_COPY.interpretation,
        values: {
          rate: percent(evidence.errorRate),
          phase: i18n._(PHASE_COPY[evidence.phase]),
          overall: percent(evidence.overallErrorRate),
        },
      })}
      evidence={i18n._({
        ...PHASE_PERF_COPY.evidence,
        values: {
          moves: i18n.number(evidence.ownMovesInPhase),
          games: evidence.gamesAnalysed,
        },
      })}
      details={{
        summary: i18n._(PHASE_PERF_COPY.breakdown),
        content: (
          <dl className="flex flex-col gap-1 text-sm">
            {evidence.byPhase.map((entry) => (
              <div
                key={entry.phase}
                className="flex items-baseline justify-between gap-4"
              >
                <dt className="capitalize">{i18n._(PHASE_COPY[entry.phase])}</dt>
                <dd className="text-muted-foreground tabular-nums">
                  {entry.rate === null
                    ? i18n._(PHASE_PERF_COPY.phaseThin)
                    : i18n._({
                        ...PHASE_PERF_COPY.phaseRow,
                        values: {
                          errors: i18n.number(entry.errors),
                          moves: i18n.number(entry.ownMoves),
                        },
                      })}
                </dd>
              </div>
            ))}
          </dl>
        ),
      }}
      // Only a phase measurably worse than the others earns a call to
      // action; a merely different one has nothing to fix.
      action={
        weakness && (
          <Button render={<Link to="/drill" />}>{i18n._(PHASE_PERF_COPY.action)}</Button>
        )
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* Recurring mistake                                                    */
/* ------------------------------------------------------------------ */

const RECURRING_COPY = {
  headline: {
    mistake: msg`Mistakes keep landing in your {phase}`,
    blunder: msg`Blunders keep landing in your {phase}`,
  },
  interpretation: msg`{count} of them in your {moves} moves there — {rate}, against your usual {overall}.`,
  interpretationWithOpening: msg`{count} of them in your {moves} moves there — {rate}, against your usual {overall}. {openingCount} came from {opening}.`,
  evidence: msg`Across {games, plural, one {# analysed game} other {# analysed games}}.`,
  action: msg`Train this`,
} as const;

function RecurringMistakeView({
  finding,
  emphasis,
}: {
  finding: FindingOf<"recurring-mistake">;
  emphasis: "hero" | "standard";
}) {
  const { i18n } = useLingui();
  const percent = usePercent();
  const { evidence } = finding;

  const base = {
    count: i18n.number(evidence.mistakes),
    moves: i18n.number(evidence.ownMovesInPhase),
    rate: percent(evidence.rate),
    overall: percent(evidence.overallRate),
  };
  const interpretation = evidence.topOpening
    ? i18n._({
        ...RECURRING_COPY.interpretationWithOpening,
        values: {
          ...base,
          openingCount: i18n.number(evidence.topOpening.mistakes),
          opening: evidence.topOpening.name,
        },
      })
    : i18n._({ ...RECURRING_COPY.interpretation, values: base });

  return (
    <FindingBlock
      emphasis={emphasis}
      headline={i18n._({
        ...RECURRING_COPY.headline[evidence.category],
        values: { phase: i18n._(PHASE_COPY[evidence.phase]) },
      })}
      interpretation={interpretation}
      evidence={i18n._({
        ...RECURRING_COPY.evidence,
        values: { games: evidence.gamesAnalysed },
      })}
      action={
        <Button render={<Link to="/drill" />}>{i18n._(RECURRING_COPY.action)}</Button>
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* Winning-position conversion                                          */
/* ------------------------------------------------------------------ */

const CONVERSION_COPY = {
  headline: msg`Winning positions are slipping away`,
  interpretation: msg`From clearly winning positions, {rate} of your moves gave a real share of the win back — {throws, plural, one {# time} other {# times}} in {positions} chances.`,
  evidence: msg`{games, plural, one {# game} other {# games}} affected, out of {analysed} analysed.`,
  worst: msg`Open the worst one`,
  action: msg`Train this`,
} as const;

function ConversionView({
  finding,
  emphasis,
}: {
  finding: FindingOf<"winning-position-blunders">;
  emphasis: "hero" | "standard";
}) {
  const { i18n } = useLingui();
  const percent = usePercent();
  const { evidence } = finding;

  return (
    <FindingBlock
      emphasis={emphasis}
      headline={i18n._(CONVERSION_COPY.headline)}
      interpretation={i18n._({
        ...CONVERSION_COPY.interpretation,
        values: {
          rate: percent(evidence.rate),
          throws: evidence.throws,
          positions: i18n.number(evidence.winningPositions),
        },
      })}
      evidence={i18n._({
        ...CONVERSION_COPY.evidence,
        values: {
          games: evidence.gamesAffected,
          analysed: i18n.number(evidence.gamesAnalysed),
        },
      })}
      details={
        evidence.worst
          ? {
              summary: i18n._(CONVERSION_COPY.worst),
              content: (
                <Button
                  variant="outline"
                  render={
                    <Link
                      to="/games/$gameId"
                      params={{ gameId: evidence.worst.gameId }}
                    />
                  }
                >
                  {i18n._(CONVERSION_COPY.worst)}
                </Button>
              ),
            }
          : undefined
      }
      action={
        <Button render={<Link to="/drill" />}>{i18n._(CONVERSION_COPY.action)}</Button>
      }
    />
  );
}

/* ------------------------------------------------------------------ */
/* Performance trend                                                    */
/* ------------------------------------------------------------------ */

const TREND_COPY = {
  improving: msg`Your last {n} games are a clear step up`,
  declining: msg`Your last {n} games have slipped`,
  interpretation: msg`You scored {latest} against {previous} in the {n} before them.`,
  evidence: msg`Two windows of {n} games each, most recent last.`,
  score: msg`Score`,
  rating: msg`Rating`,
  mistakes: msg`Mistakes per game`,
  blunders: msg`Blunders per game`,
  action: msg`View games`,
} as const;

function TrendView({
  finding,
  emphasis,
}: {
  finding: FindingOf<"performance-trend">;
  emphasis: "hero" | "standard";
}) {
  const { i18n } = useLingui();
  const percent = usePercent();
  const { evidence } = finding;
  const improving = evidence.latest.winRate >= evidence.previous.winRate;

  const perGame = (value: number) => i18n.number(value, { maximumFractionDigits: 1 });

  // A row renders only when both windows can answer — a comparison with
  // one side missing is a number, not a trend.
  const rows = [
    {
      key: "score",
      label: i18n._(TREND_COPY.score),
      previous: percent(evidence.previous.winRate),
      latest: percent(evidence.latest.winRate),
    },
    evidence.previous.averageRating !== null && evidence.latest.averageRating !== null
      ? {
          key: "rating",
          label: i18n._(TREND_COPY.rating),
          previous: i18n.number(Math.round(evidence.previous.averageRating)),
          latest: i18n.number(Math.round(evidence.latest.averageRating)),
        }
      : null,
    evidence.previous.mistakesPerGame !== null && evidence.latest.mistakesPerGame !== null
      ? {
          key: "mistakes",
          label: i18n._(TREND_COPY.mistakes),
          previous: perGame(evidence.previous.mistakesPerGame),
          latest: perGame(evidence.latest.mistakesPerGame),
        }
      : null,
    evidence.previous.blundersPerGame !== null && evidence.latest.blundersPerGame !== null
      ? {
          key: "blunders",
          label: i18n._(TREND_COPY.blunders),
          previous: perGame(evidence.previous.blundersPerGame),
          latest: perGame(evidence.latest.blundersPerGame),
        }
      : null,
  ].filter((row): row is NonNullable<typeof row> => row !== null);

  return (
    <FindingBlock
      emphasis={emphasis}
      headline={i18n._({
        ...(improving ? TREND_COPY.improving : TREND_COPY.declining),
        values: { n: evidence.windowSize },
      })}
      interpretation={i18n._({
        ...TREND_COPY.interpretation,
        values: {
          latest: percent(evidence.latest.winRate),
          previous: percent(evidence.previous.winRate),
          n: evidence.windowSize,
        },
      })}
      evidence={i18n._({
        ...TREND_COPY.evidence,
        values: { n: evidence.windowSize },
      })}
      action={
        <Button variant="outline" render={<Link to="/games" />}>
          {i18n._(TREND_COPY.action)}
        </Button>
      }
    >
      <dl className="flex flex-col gap-1 text-sm">
        {rows.map((row) => (
          <div key={row.key} className="flex items-baseline justify-between gap-4">
            <dt>{row.label}</dt>
            <dd className="text-muted-foreground tabular-nums">
              {row.previous} → <span className="text-foreground">{row.latest}</span>
            </dd>
          </div>
        ))}
      </dl>
    </FindingBlock>
  );
}
