import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useState } from "react";

import { Board } from "@velachess/ui/chess/board";
import type { BoardMove } from "@velachess/ui/chess/board";
import {
  BOARD_STAGE_WIDTH,
  BoardColumn,
  BoardPanel,
  BoardStageSkeleton,
  BoardStatus,
} from "@velachess/ui/chess/board-stage";
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from "@velachess/ui/components/breadcrumb";
import { Button } from "@velachess/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@velachess/ui/components/empty";
import { Progress } from "@velachess/ui/components/progress";

import { BoardScreen } from "../app-shell/board-screen.tsx";
import { api, parseResponse } from "../shared/api/client.ts";
import { legalTargetsFrom, playMove, squaresOfSanAt } from "../drill/move.ts";
import { useMutation, useQuery, useQueryClient } from "../shared/libs/query/index.ts";
import { drillNextQuery, drillQueueQuery } from "../drill/queries.ts";
import { repertoireQuery } from "./queries.ts";

/**
 * Practice: can I recall what I prepared?
 *
 * The same shell as Study and Game Review — a dominant board with a
 * context panel beside it — because this is another mode of the same
 * chapter, not a widget. What changes is the panel: no variation tree,
 * because the tree is the answer. It holds the instruction, how far
 * through the session you are, and the verdict once you have played.
 *
 * Deliberately not the drill screen. Drills come from mistakes the
 * engine found in your games and ask "find something better"; practice
 * asks "play your line" — same scheduling underneath, a different
 * question, reached from the repertoire rather than from the mistakes
 * list, and scoped so what you practise is what you opened.
 */
const PRACTICE_COPY = {
  title: msg`Practice`,
  loading: msg`Loading…`,
  loadError: msg`Couldn't load this practice session.`,
  boardRegion: msg`Position to play`,
  panelRegion: msg`Practice`,
  prompt: msg`Play the move you prepared.`,
  whiteToMove: msg`White to move`,
  blackToMove: msg`Black to move`,
  seenBefore: msg`Seen before`,
  firstTime: msg`First time`,
  right: msg`Correct.`,
  wrong: msg`Not your line.`,
  preparedMove: msg`Prepared move:`,
  continue: msg`Continue`,
  emptyTitle: msg`Nothing to practice`,
  emptyBody: msg`Every position in this repertoire is scheduled for later. Come back when the next ones fall due.`,
  doneTitle: msg`Practice complete`,
  doneBody: msg`You went through everything due in this repertoire.`,
  back: msg`Back to the repertoire`,
  progress: msg`Progress`,
  due: msg`{count, plural, one {# position due} other {# positions due}}`,
  completed: msg`{done} / {total} completed`,
  showing: msg`Position to play`,
  played: msg`You played {san}.`,
} as const;

interface Answer {
  expectedSans: string[];
  correct: boolean;
  /** The move just played, so the board can keep showing it. */
  fen: string;
  san: string;
}

export function RepertoirePractice() {
  const { repertoireId = "" } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as { chapter?: string };
  return (
    <PracticeSession
      key={`${repertoireId}:${search.chapter ?? ""}`}
      scope={{
        repertoire: repertoireId,
        ...(search.chapter ? { chapter: search.chapter } : {}),
      }}
      repertoireId={repertoireId}
      chapterId={search.chapter}
    />
  );
}

function PracticeSession({
  scope,
  repertoireId,
  chapterId,
}: {
  scope: { repertoire: string; chapter?: string };
  repertoireId: string;
  chapterId: string | undefined;
}) {
  const { i18n } = useLingui();
  const queryClient = useQueryClient();
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [done, setDone] = useState(0);

  const queue = useQuery(drillQueueQuery(scope));
  const next = useQuery(drillNextQuery(scope));
  // What the session is called, which the queue cannot say: the scope is
  // a pair of ids. Names only — no answer travels through here.
  const book = useQuery(repertoireQuery(repertoireId));

  const submit = useMutation({
    mutationFn: async (input: { exerciseId: string; san: string; fen: string }) => {
      const graded = await parseResponse(
        api.drill.answer.$post({
          json: { exerciseId: input.exerciseId, san: input.san },
        }),
      );
      return { ...graded, fen: input.fen, san: input.san };
    },
    onSuccess: (graded) => setAnswer(graded),
  });

  if (queue.isPending || next.isPending) {
    return <BoardStageSkeleton label={i18n._(PRACTICE_COPY.loading)} />;
  }

  if (queue.isError || next.isError) {
    return (
      <Empty className="m-6 border-0">
        <EmptyHeader>
          <EmptyDescription>{i18n._(PRACTICE_COPY.loadError)}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const total = queue.data.due + queue.data.fresh;
  const item = next.data;

  if (!item) {
    // Finishing a session and finding nothing due are different
    // sentences: one is an achievement, the other is a state.
    const finished = done > 0;
    return (
      <Empty className="m-6 border-0">
        <EmptyHeader>
          <EmptyTitle>
            {i18n._(finished ? PRACTICE_COPY.doneTitle : PRACTICE_COPY.emptyTitle)}
          </EmptyTitle>
          <EmptyDescription>
            {i18n._(finished ? PRACTICE_COPY.doneBody : PRACTICE_COPY.emptyBody)}
          </EmptyDescription>
        </EmptyHeader>
        <Button
          variant="outline"
          render={<Link to="/repertoire/$repertoireId" params={{ repertoireId }} />}
        >
          {i18n._(PRACTICE_COPY.back)}
        </Button>
      </Empty>
    );
  }

  const play = (move: BoardMove): boolean => {
    // `to` is null when a piece is dropped off the board — nothing was
    // played, so nothing is answered.
    if (answer || submit.isPending || !move.to) return false;
    const played = playMove(item.fen, move.from, move.to);
    if (!played) return false;
    submit.mutate({ exerciseId: item.exerciseId, san: played.san, fen: played.fen });
    return true;
  };

  const advance = () => {
    setAnswer(null);
    setDone((count) => count + 1);
    void queryClient.invalidateQueries({ queryKey: ["drill"] });
  };

  const shownFen = answer?.fen ?? item.fen;
  // The line you prepared, drawn on the board when you missed it — the
  // one place this screen touches chess, because the answer arrives as
  // SAN and the board speaks squares.
  const expected = answer?.correct === false ? answer.expectedSans[0] : undefined;
  const expectedArrow = expected
    ? (squaresOfSanAt(item.fen, expected) ?? undefined)
    : undefined;

  const chapter = book.data?.chapters.find((row) => row.id === chapterId);
  const heading = chapter?.name ?? book.data?.name ?? i18n._(PRACTICE_COPY.title);
  const sideToMove = item.fen.includes(" w ") ? "white" : "black";

  return (
    <BoardScreen
      page={i18n._(PRACTICE_COPY.title)}
      crumbs={
        book.data && (
          <BreadcrumbItem>
            <BreadcrumbLink
              render={
                <Link to="/repertoire/$repertoireId" params={{ repertoireId }}>
                  {book.data.name}
                </Link>
              }
            />
            <BreadcrumbSeparator />
          </BreadcrumbItem>
        )
      }
    >
      <BoardColumn label={i18n._(PRACTICE_COPY.boardRegion)}>
        <Board
          fen={shownFen}
          orientation={sideToMove}
          animated={false}
          interactive={!answer}
          onMove={play}
          legalTargetsOf={(square) => legalTargetsFrom(item.fen, square)}
          // Only ever after an answer: an arrow before one would be the
          // answer to the question being asked.
          suggestedMove={expectedArrow}
          className={BOARD_STAGE_WIDTH}
        />
        <BoardStatus>{i18n._(PRACTICE_COPY.showing)}</BoardStatus>
      </BoardColumn>

      <BoardPanel label={i18n._(PRACTICE_COPY.panelRegion)}>
        <div className="flex shrink-0 flex-col gap-3 border-b p-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-lg leading-tight font-semibold">{heading}</h1>
            <p className="text-muted-foreground text-sm">
              {i18n._({ ...PRACTICE_COPY.due, values: { count: total } })}
            </p>
          </div>

          <div className="flex flex-col gap-1">
            <Progress
              value={progressOf(done, total)}
              aria-label={i18n._(PRACTICE_COPY.progress)}
            />
            <p className="text-muted-foreground text-xs">
              {i18n._({
                ...PRACTICE_COPY.completed,
                values: { done, total: Math.max(total, done) },
              })}
            </p>
          </div>
        </div>

        {/* Whose move it is and whether this is a first sighting: neither
            narrows the answer — they say what the question is and how
            much of it you are expected to already know. */}
        <div className="text-muted-foreground flex shrink-0 items-center gap-2 border-b p-3 text-xs">
          <span>
            {i18n._(
              sideToMove === "white"
                ? PRACTICE_COPY.whiteToMove
                : PRACTICE_COPY.blackToMove,
            )}
          </span>
          <span aria-hidden="true">·</span>
          <span>
            {i18n._(
              item.phase === "due" ? PRACTICE_COPY.seenBefore : PRACTICE_COPY.firstTime,
            )}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <Verdict answer={answer} />
        </div>

        {answer && (
          <div className="shrink-0 border-t p-3">
            <Button className="w-full" onClick={advance}>
              {i18n._(PRACTICE_COPY.continue)}
            </Button>
          </div>
        )}
      </BoardPanel>
    </BoardScreen>
  );
}

/** Before an answer, the question; after it, what you prepared. The
 * region is live, so the verdict reaches a screen reader that never saw
 * the board change. */
function Verdict({ answer }: { answer: Answer | null }) {
  const { i18n } = useLingui();

  if (!answer) {
    return (
      <p aria-live="polite" className="text-sm">
        {i18n._(PRACTICE_COPY.prompt)}
      </p>
    );
  }

  return (
    <div aria-live="polite" className="flex flex-col gap-2">
      <p className={verdictStyle(answer.correct)}>
        {i18n._(answer.correct ? PRACTICE_COPY.right : PRACTICE_COPY.wrong)}
      </p>
      <p className="text-muted-foreground text-sm">
        {i18n._({ ...PRACTICE_COPY.played, values: { san: answer.san } })}
      </p>
      {!answer.correct && (
        <p className="text-sm">
          {i18n._(PRACTICE_COPY.preparedMove)}{" "}
          <code className="text-foreground">{answer.expectedSans.join(", ")}</code>
        </p>
      )}
    </div>
  );
}

function verdictStyle(correct: boolean): string {
  return correct ? "text-sm font-medium" : "text-destructive text-sm font-medium";
}

/** Zero positions is zero progress, not a division by zero. */
function progressOf(done: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(100, (done / Math.max(total, 1)) * 100);
}
