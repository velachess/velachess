import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Board } from "@velachess/ui/chess/board";
import type { BoardMove } from "@velachess/ui/chess/board";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@velachess/ui/components/breadcrumb";
import { Button } from "@velachess/ui/components/button";
import {
  Empty as EmptyState,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@velachess/ui/components/empty";
import { Progress } from "@velachess/ui/components/progress";
import { Skeleton } from "@velachess/ui/components/skeleton";
import { cn } from "@velachess/ui/lib/utils";
import { ArrowRight } from "@velachess/ui/icons";
import { Link, useSearch } from "@tanstack/react-router";
import { Fragment, useState } from "react";

import { useBreadcrumbTrail } from "../app-shell/breadcrumb-trail.ts";
import { api, parseResponse } from "../shared/api/client.ts";
import {
  CHESS_SOUND_EVENT,
  useChessSounds,
} from "../shared/chess-sounds/chess-sounds.ts";
import { useMutation, useQuery, useQueryClient } from "../shared/libs/query/index.ts";
import { DrillPrompt } from "./drill-prompt.tsx";
import { DrillQueuePanel, totalWaiting } from "./drill-queue-panel.tsx";
import { legalTargetsFrom, playMove, sideToMove } from "./move.ts";
import {
  drillNextQuery,
  drillQueueQuery,
  type DrillAnswer,
  type DrillItem,
  type DrillQueue,
  type DrillScopeSearch,
} from "./queries.ts";
import { advanced, boardFen, toGoIn, verdictArrows, type Session } from "./session.ts";

const DRILL_COPY = {
  title: msg`Drill`,
  subtitle: msg`Drill what is costing you games.`,
  loading: msg`Loading…`,
  loadError: msg`Couldn't load drills.`,
  emptyTitle: msg`Nothing due today`,
  emptyBody: msg`Import or analyze a game and new positions land here on their own.`,
  boardLabel: msg`Position to solve`,
  correct: msg`Right.`,
  wrong: msg`Not the move.`,
  attemptedMove: msg`You tried`,
  nextReview: msg`Next review`,
  continue: msg`Continue`,
  endSession: msg`End session`,
  progress: msg`Progress`,
  toGo: msg`To go`,
  tallyWrong: msg`Wrong`,
  tallyRight: msg`Right`,
  doneTitle: msg`Session complete`,
  doneBody: msg`Everything due is drilled. Come back when the next ones fall due.`,
  backToQueue: msg`Back to drills`,
  session: msg`Drilling`,
} as const;

/**
 * The board's own width, passed as its `className` rather than to a
 * wrapper.
 *
 * `Board` carries `max-w-xl` of its own, so a wrapper can only ever make
 * it smaller — a wider wrapper just grows and leaves the board sitting in
 * a gap. On the class the merge replaces that cap instead of losing to
 * it.
 *
 * `svh` because mobile chrome shrinks the viewport, and the subtraction
 * is this screen's furniture: page padding and the breadcrumb. Analysis
 * takes off more because it also has two player strips and an eval bar.
 */
const BOARD_WIDTH = "w-full min-w-0 max-w-[min(100svh-7rem,100%)] justify-self-stretch";

/**
 * The board's own position while an answer is on screen.
 *
 * Without it the drop handler accepts a move that the board never shows —
 * `position` never changes, so the piece snaps back and accepting looks
 * exactly like rejecting. The move stays on the board until the person
 * moves on.
 */
interface Attempt {
  fen: string;
  /** The move just played here, which is what the red arrow draws. Not
   * `context.playedSan` — that is the move from the original game, and
   * pointing at it would grade a choice nobody made just now. */
  san: string;
  answer: DrillAnswer | null;
}

export function Drill() {
  const { i18n } = useLingui();
  const playSound = useChessSounds();
  const queryClient = useQueryClient();
  // The scope arrives in the URL — a chapter's Train button, a book's,
  // an insight's CTA. Absent params mean the whole queue, unchanged.
  const scope = useSearch({ strict: false }) as DrillScopeSearch;
  const [session, setSession] = useState<Session | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  // When the current position went up, so the answer can be timed. Reset
  // on every continue rather than derived from a query timestamp: the
  // clock the person feels starts when the board changes.
  const [shownAt, setShownAt] = useState(() => Date.now());

  const queue = useQuery(drillQueueQuery(scope));
  const next = useQuery({ ...drillNextQuery(scope), enabled: session !== null });

  const submit = useMutation({
    mutationFn: async (input: {
      exerciseId: string;
      san: string;
      fen: string;
      responseTimeMs: number;
    }) => {
      const answer = await parseResponse(
        api.drill.answer.$post({
          json: {
            exerciseId: input.exerciseId,
            san: input.san,
            responseTimeMs: input.responseTimeMs,
          },
        }),
      );
      return {
        fen: input.fen,
        san: input.san,
        answer,
      };
    },
    onSuccess: setAttempt,
  });

  /**
   * A dropped piece: show it, then ask the server about it.
   *
   * The board is told `true` and given the position that move produces in
   * the same beat. Returning `true` without changing `position` snaps the
   * piece back, so accepting a move would look identical to refusing one.
   * Waiting for the round trip first reads the same way.
   */
  function handleMove(move: BoardMove): boolean {
    if (attempt?.answer || !move.to || !item) return false;

    const played = playMove(item.fen, move.from, move.to);
    if (!played) return false;

    playSound({ type: CHESS_SOUND_EVENT.MOVE, fenBefore: item.fen, san: played.san });

    // Recorded, not rendered: the board keeps showing the position as it
    // was asked until the answer says the move belongs there.
    setAttempt({ fen: played.fen, san: played.san, answer: null });
    submit.mutate({
      exerciseId: item.exerciseId,
      san: played.san,
      fen: played.fen,
      // How long the position was on screen. The server grades on this
      // as well as on being right, which is what makes the schedule
      // adapt without anyone being asked how hard it felt.
      responseTimeMs: Math.max(0, Date.now() - shownAt),
    });
    return true;
  }

  function continueSession() {
    const answer = attempt?.answer ?? null;
    if (session && item && answer && toGoIn(advanced(session, item, answer)) === 0) {
      playSound({ type: CHESS_SOUND_EVENT.GAME_END });
    }
    setAttempt(null);
    setShownAt(Date.now());
    // Drop the retry that was just served. Done here rather than when it
    // is picked so a reload mid-position does not silently lose it.
    setSession((current) =>
      current && !next.data ? { ...current, retry: current.retry.slice(1) } : current,
    );
    setSession((current) =>
      current && item ? advanced(current, item, attempt?.answer ?? null) : current,
    );
    void queryClient.invalidateQueries({ queryKey: ["drill"] });
  }

  function endSession() {
    playSound({ type: CHESS_SOUND_EVENT.GAME_END });
    closeSession();
  }

  function closeSession() {
    setAttempt(null);
    setSession(null);
    void queryClient.invalidateQueries({ queryKey: ["drill"] });
  }

  if (queue.isPending) {
    return (
      <Screen>
        <DrillQueueSkeleton />
      </Screen>
    );
  }

  if (queue.isError) {
    return (
      <Screen>
        <EmptyState className="border-0">
          <EmptyHeader>
            <EmptyDescription>{i18n._(DRILL_COPY.loadError)}</EmptyDescription>
          </EmptyHeader>
        </EmptyState>
      </Screen>
    );
  }

  const waiting = totalWaiting(queue.data);

  function startSession() {
    playSound({ type: CHESS_SOUND_EVENT.GAME_START });
    setSession({ size: waiting, right: 0, wrong: 0, retry: [] });
  }

  if (!session) {
    return (
      <Screen>
        <QueueStart queue={queue.data} waiting={waiting} onStart={startSession} />
      </Screen>
    );
  }

  // The server first, the retries after: a missed position waits until
  // everything unseen has had its turn, which is what puts it at the back
  // of the sitting rather than immediately in front of you again.
  const item = next.data ?? session.retry[0] ?? null;
  if (next.isPending) {
    return (
      <Screen>
        <DrillQueueSkeleton />
      </Screen>
    );
  }
  if (next.isError) {
    return (
      <Screen>
        <EmptyState className="border-0">
          <EmptyHeader>
            <EmptyDescription>{i18n._(DRILL_COPY.loadError)}</EmptyDescription>
          </EmptyHeader>
        </EmptyState>
      </Screen>
    );
  }
  if (!item) {
    return (
      <Screen>
        <Empty title={i18n._(DRILL_COPY.doneTitle)} body={i18n._(DRILL_COPY.doneBody)}>
          <Button variant="outline" onClick={closeSession}>
            {i18n._(DRILL_COPY.backToQueue)}
          </Button>
        </Empty>
      </Screen>
    );
  }

  const answer = attempt?.answer ?? null;
  const displayedSession = answer ? advanced(session, item, answer) : session;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-4 lg:overflow-hidden">
      <Trail current={i18n._(DRILL_COPY.session)} />
      <div className="grid min-h-0 flex-1 auto-rows-min gap-4 lg:auto-rows-fr lg:grid-cols-[minmax(0,1fr)_minmax(24rem,34rem)]">
        <section
          aria-label={i18n._(DRILL_COPY.boardLabel)}
          className="flex min-h-0 min-w-0 flex-col justify-center"
        >
          <Board
            className={BOARD_WIDTH}
            // The move lands only once it is known to be right.
            //
            // Showing it the moment it was dropped and rewinding on a
            // wrong answer made the piece jump out and back — the board
            // asserting a move and then taking it away. Waiting for the
            // round trip costs a beat on the correct case and never
            // moves a piece that should not have moved.
            fen={boardFen(item.fen, attempt)}
            orientation={sideToMove(item.fen)}
            legalTargetsOf={(square) => legalTargetsFrom(item.fen, square)}
            interactive={answer === null}
            onMove={handleMove}
            {...verdictArrows(item, attempt)}
          />
        </section>

        <aside className="bg-card flex min-h-0 flex-col overflow-hidden rounded-lg border">
          <div className="shrink-0 border-b p-4">
            <SessionHeader
              session={displayedSession}
              labels={{
                progress: i18n._(DRILL_COPY.progress),
                end: i18n._(DRILL_COPY.endSession),
                toGo: i18n._(DRILL_COPY.toGo),
                wrong: i18n._(DRILL_COPY.tallyWrong),
                right: i18n._(DRILL_COPY.tallyRight),
              }}
              onEnd={endSession}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
            <DrillBody item={item} answer={answer} attemptedSan={attempt?.san} />
          </div>

          <ContinueAction answer={answer} onContinue={continueSession} />
        </aside>
      </div>
    </div>
  );
}

function QueueStart({
  queue,
  waiting,
  onStart,
}: {
  queue: DrillQueue | undefined;
  waiting: number;
  onStart: () => void;
}) {
  const { i18n } = useLingui();

  if (waiting === 0 || !queue) {
    return (
      <Empty title={i18n._(DRILL_COPY.emptyTitle)} body={i18n._(DRILL_COPY.emptyBody)} />
    );
  }

  return <DrillQueuePanel queue={queue} onStart={onStart} />;
}

function DrillQueueSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
      <Skeleton className="h-20 w-full max-w-sm" />
      <Skeleton className="h-10 w-32" />
    </div>
  );
}

function DrillBody({
  item,
  answer,
  attemptedSan,
}: {
  item: DrillItem;
  answer: DrillAnswer | null;
  attemptedSan: string | undefined;
}) {
  const { i18n } = useLingui();

  if (!answer) return <DrillPrompt item={item} answer={null} />;

  const verdict = answer.correct ? DRILL_COPY.correct : DRILL_COPY.wrong;
  const nextReview = i18n.date(new Date(answer.nextDue), {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg font-medium">{i18n._(verdict)}</p>

      <dl className="grid grid-cols-2 gap-3">
        <div className="bg-muted/50 rounded-md p-3">
          <dt className="text-muted-foreground text-xs">
            {i18n._(DRILL_COPY.attemptedMove)}
          </dt>
          <dd className="mt-1 font-mono text-sm">{attemptedSan}</dd>
        </div>
        <div className="bg-muted/50 rounded-md p-3">
          <dt className="text-muted-foreground text-xs">
            {i18n._(DRILL_COPY.nextReview)}
          </dt>
          <dd className="mt-1 text-sm">
            <time dateTime={answer.nextDue}>{nextReview}</time>
          </dd>
        </div>
      </dl>

      <DrillPrompt item={item} answer={answer} />
    </div>
  );
}

function ContinueAction({
  answer,
  onContinue,
}: {
  answer: DrillAnswer | null;
  onContinue: () => void;
}) {
  const { i18n } = useLingui();

  if (!answer) return null;

  return (
    <div className="shrink-0 border-t p-3">
      <Button className="h-11 w-full md:h-9" onClick={onContinue}>
        {i18n._(DRILL_COPY.continue)}
        <ArrowRight data-icon="inline-end" />
      </Button>
    </div>
  );
}

/**
 * The trail the rest of the app has, so leaving a session is a link like
 * anywhere else rather than a button that only exists here.
 */
function Trail({ current }: { current: string }) {
  const { i18n } = useLingui();
  const trail = useBreadcrumbTrail();

  return (
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
          <BreadcrumbPage>{current}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/**
 * Where you are in the session, and the way out.
 *
 * "End session" rather than a close icon: leaving is a decision with a
 * consequence — the rest stays due — and an X does not say that.
 */
function SessionHeader({
  session,
  labels,
  onEnd,
}: {
  session: Session;
  labels: { progress: string; end: string; toGo: string; wrong: string; right: string };
  onEnd: () => void;
}) {
  const toGo = toGoIn(session);
  const progress = session.size === 0 ? 0 : (session.right / session.size) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-muted-foreground text-sm tabular-nums">
          {Math.min(session.right + 1, session.size)} / {session.size}
        </p>
        {/* An action, not navigation: the rest of the queue stays due. A
            link would say it takes you somewhere. */}
        <Button variant="ghost" size="sm" onClick={onEnd}>
          {labels.end}
        </Button>
      </div>

      {/* No children: `Progress` renders its own track and indicator, so
          supplying them drew the bar twice. */}
      <Progress aria-label={labels.progress} value={progress} />

      {/* How the sitting is going, which is what a repetition loop shows
          instead of a hint: the help is the second pass, and these say
          how much of it is coming. */}
      <dl className="grid grid-cols-3 gap-2 text-center">
        <Tally label={labels.toGo} value={toGo} tone="neutral" />
        <Tally label={labels.wrong} value={session.wrong} tone="wrong" />
        <Tally label={labels.right} value={session.right} tone="right" />
      </dl>
    </div>
  );
}

/**
 * The three tallies, in the grade colours the rest of the app uses for
 * the same verdicts — so a miss here is the same red as a blunder in the
 * report. "To go" stays neutral: work remaining is not a verdict.
 *
 * Colour is never the only carrier: each tally is labelled, so the split
 * survives a monochrome screen and a colour-blind reader.
 */
const TALLY_TONE = {
  neutral: "text-muted-foreground",
  wrong: "text-[var(--grade-blunder)]",
  right: "text-[var(--grade-ok)]",
} as const;

function Tally({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: keyof typeof TALLY_TONE;
}) {
  return (
    <div className="bg-muted/50 rounded-md px-2 py-1.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={cn("text-sm font-medium tabular-nums", TALLY_TONE[tone])}>
        {value}
      </dd>
    </div>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  const { i18n } = useLingui();
  return (
    <section className="flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-medium">{i18n._(DRILL_COPY.title)}</h1>
        <p className="text-muted-foreground text-sm">{i18n._(DRILL_COPY.subtitle)}</p>
      </header>
      {children}
    </section>
  );
}

function Empty({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <EmptyState>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
      {children}
    </EmptyState>
  );
}
