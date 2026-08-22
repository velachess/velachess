import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { Link, useParams } from "@tanstack/react-router";
import { Fragment, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { Board } from "@velachess/ui/chess/board";
import type { BoardMove } from "@velachess/ui/chess/board";
import {
  BOARD_STAGE_WIDTH,
  BoardColumn,
  BoardPanel,
  BoardStageSkeleton,
  BoardStatus,
} from "@velachess/ui/chess/board-stage";
import { MoveNav } from "@velachess/ui/chess/move-nav";
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from "@velachess/ui/components/breadcrumb";
import { Button } from "@velachess/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader } from "@velachess/ui/components/empty";
import { cn } from "@velachess/ui/lib/utils";

import { BoardScreen } from "../app-shell/board-screen.tsx";
import {
  CHESS_SOUND_EVENT,
  useChessSounds,
} from "../shared/chess-sounds/chess-sounds.ts";
import { useQuery } from "../shared/libs/query/index.ts";
import {
  chapterQuery,
  type ChapterDetail,
  type ChapterMove,
  type MoveCursor,
} from "./queries.ts";

/**
 * Study: what did I prepare?
 *
 * Same shell as Game Review and Practice — a dominant board with a
 * context panel beside it — and the panel is the chapter navigator: the
 * variation tree is its content, not a PGN string in a mostly empty box.
 *
 * Study shows the answers. Moves are named, arrows point at what the
 * repertoire plays, navigation is free and nothing here is graded or
 * scheduled; recall is Practice's question, one button away.
 *
 * Everything on screen arrives interpreted from the server (labels,
 * playable positions, the squares a move touched, what is prepared
 * next): this file picks a cursor and maps over what came back.
 */
const STUDY_COPY = {
  loading: msg`Loading the chapter…`,
  loadError: msg`Couldn't load this chapter.`,
  boardRegion: msg`Board`,
  panelRegion: msg`Chapter`,
  start: msg`Starting position`,
  showingStart: msg`Starting position`,
  navigation: msg`Move navigation`,
  previous: msg`Previous move`,
  next: msg`Next move`,
  previousShort: msg`Prev`,
  nextShort: msg`Next`,
  reset: msg`Back to the start`,
  practice: msg`Practice chapter`,
  preparedMove: msg`Prepared move`,
  yourMove: msg`Your repertoire plays:`,
  /* Not "prepared replies": on the opponent's turn these are HIS moves —
   * the ones this chapter has an answer to. Calling them replies made a
   * Black chapter open by attributing 1. d4 to the reader. */
  theirMove: msg`Opponent plays:`,
  lineEnds: msg`The prepared line ends here.`,
  currentLine: msg`Current line`,
  explore: msg`Play the prepared moves on the board to walk the line.`,
  variation: msg`Variation`,
  mainLine: msg`Main line`,
} as const;

export function ChapterStudy() {
  const { repertoireId = "", chapterId = "" } = useParams({ strict: false });
  return (
    <ChapterStudyContent
      key={`${repertoireId}:${chapterId}`}
      repertoireId={repertoireId}
      chapterId={chapterId}
    />
  );
}

function ChapterStudyContent({
  repertoireId,
  chapterId,
}: {
  repertoireId: string;
  chapterId: string;
}) {
  const { i18n } = useLingui();
  const query = useQuery(chapterQuery(repertoireId, chapterId));

  if (query.isPending) {
    return <BoardStageSkeleton label={i18n._(STUDY_COPY.loading)} />;
  }

  if (query.isError) {
    return (
      <Empty className="m-6 border-0">
        <EmptyHeader>
          <EmptyDescription>{i18n._(STUDY_COPY.loadError)}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return <ChapterReader chapter={query.data} />;
}

/** Null = the starting position, before the first move of any line. */
type Cursor = MoveCursor | null;

function ChapterReader({ chapter }: { chapter: ChapterDetail }) {
  const { i18n } = useLingui();
  const playSound = useChessSounds();
  const [cursor, setCursor] = useState<Cursor>(null);

  const line = cursor ? chapter.lines[cursor.line] : undefined;
  const move: ChapterMove | undefined = cursor ? line?.moves[cursor.move] : undefined;
  const here = move ?? chapter.start;
  const prepared = here.prepared;

  // Stepping is a cursor move, both directions. Back off the head of a
  // variation lands on the move it replaces, which is where a reader
  // came from — the server said which one that is.
  const back = (): Cursor => {
    if (!cursor || !line) return null;
    // Inside the line: the move before this one.
    if (cursor.move > 0) return { line: cursor.line, move: cursor.move - 1 };
    // At the head of a variation: the position it branched from, which
    // is the move *before* the one this variation replaces.
    const from = line.branchesFrom;
    if (!from) return null;
    if (from.move === 0) return null;
    return { line: from.line, move: from.move - 1 };
  };
  const forward = (): Cursor => prepared[0]?.at ?? cursor;

  /** A dropped piece is a prepared move, or it is nothing. */
  const play = (played: BoardMove): boolean => {
    const match = prepared.find(
      (option) => option.from === played.from && option.to === played.to,
    );
    if (!match) return false;
    playSound({ type: CHESS_SOUND_EVENT.MOVE, fenBefore: here.fen, san: match.san });
    setCursor(match.at);
    return true;
  };

  /** The prepared destinations from a square — the reader's move hints. */
  const hintsFrom = (square: string) =>
    prepared
      .filter((option) => option.from === square)
      // isCapture styles the hint dot; a course reader marks a prepared
      // move either way, and the server does not say which capture.
      .map((option) => ({ square: option.to, isCapture: false }));

  useHotkeys("left", () => setCursor(back), { preventDefault: true }, [cursor, line]);
  useHotkeys("right", () => setCursor(forward), { preventDefault: true }, [cursor, line]);

  return (
    <BoardScreen
      page={chapter.name}
      crumbs={
        <Fragment>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={
                <Link
                  to="/repertoire/$repertoireId"
                  params={{ repertoireId: chapter.repertoireId }}
                >
                  {chapter.repertoireName}
                </Link>
              }
            />
          </BreadcrumbItem>
          <BreadcrumbSeparator />
        </Fragment>
      }
    >
      <BoardColumn label={i18n._(STUDY_COPY.boardRegion)}>
        <Board
          fen={here.fen}
          orientation={chapter.color}
          animated={false}
          // Playing a move IS how you read a course: drop a piece on a
          // prepared move and the board follows the line. The squares
          // came with the move, so matching one takes no chess here —
          // and a move the repertoire does not have simply snaps back,
          // which is the honest answer for a reader.
          onMove={play}
          // Hints are the repertoire's own continuations, not every
          // legal move: this is a chapter, not a free board.
          legalTargetsOf={hintsFrom}
          lastMove={move ? { from: move.from, to: move.to } : undefined}
          // What is prepared from here, pointed at on the board: the
          // first at full strength, alternatives faded.
          suggestedMove={prepared[0]}
          alternatives={prepared.slice(1)}
          className={BOARD_STAGE_WIDTH}
        />

        <MoveNav
          className={BOARD_STAGE_WIDTH}
          copy={{
            navigation: i18n._(STUDY_COPY.navigation),
            previous: i18n._(STUDY_COPY.previous),
            next: i18n._(STUDY_COPY.next),
            previousShort: i18n._(STUDY_COPY.previousShort),
            nextShort: i18n._(STUDY_COPY.nextShort),
            reset: i18n._(STUDY_COPY.reset),
          }}
          canGoBack={cursor !== null}
          canGoForward={prepared.length > 0}
          onPrevious={() => setCursor(back)}
          onNext={() => setCursor(forward)}
          onReset={() => setCursor(null)}
        />

        <BoardStatus>{move?.label ?? i18n._(STUDY_COPY.showingStart)}</BoardStatus>
      </BoardColumn>

      <BoardPanel label={i18n._(STUDY_COPY.panelRegion)}>
        <div className="flex shrink-0 flex-col gap-3 border-b p-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-lg leading-tight font-semibold">{chapter.name}</h1>
            <p className="text-muted-foreground text-sm">{chapter.repertoireName}</p>
          </div>

          <Button
            className="self-start"
            render={
              <Link
                to="/repertoire/$repertoireId/practice"
                params={{ repertoireId: chapter.repertoireId }}
                search={{ chapter: chapter.id }}
              />
            }
          >
            {i18n._(STUDY_COPY.practice)}
          </Button>
        </div>

        <div className="flex shrink-0 flex-col gap-2 border-b p-3">
          {/* The trail had only a screen-reader name, so on the starting
              position it read as one unexplained button. Where the board
              is standing is worth saying out loud. */}
          <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {i18n._(STUDY_COPY.currentLine)}
          </h2>
          <CurrentLine chapter={chapter} cursor={cursor} onJump={setCursor} />
          <PreparedHere
            isOwnTurn={here.isOwnTurn}
            prepared={prepared}
            onPick={setCursor}
          />
        </div>

        {/* The tree is the panel's content and owns its own scrolling —
            a long chapter never grows the screen or pushes the header
            and the prepared move out of reach. */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="flex flex-col gap-3">
            {chapter.lines.map((chapterLine, lineIndex) => (
              <VariationLine
                key={lineIndex}
                line={chapterLine}
                lineIndex={lineIndex}
                cursor={cursor}
                onJump={setCursor}
              />
            ))}
          </div>
        </div>

        <p className="text-muted-foreground shrink-0 border-t p-3 text-xs">
          {i18n._(STUDY_COPY.explore)}
        </p>
      </BoardPanel>
    </BoardScreen>
  );
}

/** One branch of the tree: what it replaces, then its moves. Depth is
 * the server's; indenting is all this does with it. */
function VariationLine({
  line,
  lineIndex,
  cursor,
  onJump,
}: {
  line: ChapterDetail["lines"][number];
  lineIndex: number;
  cursor: Cursor;
  onJump: (cursor: Cursor) => void;
}) {
  const { i18n } = useLingui();
  const isBranch = line.depth > 0;
  const prefix = line.prefix.map((entry) => entry.label).join(" ");

  return (
    <div
      className={cn(isBranch && "border-muted border-l pl-2", line.depth > 1 && "ml-2")}
    >
      {!isBranch && (
        <p className="text-muted-foreground mb-0.5 text-xs font-medium tracking-wide uppercase">
          {i18n._(STUDY_COPY.mainLine)}
        </p>
      )}
      {isBranch && (
        <p className="text-muted-foreground mb-0.5 text-xs">
          {i18n._(STUDY_COPY.variation)}
          {prefix.length > 0 && ` · ${prefix}`}
        </p>
      )}
      <div className="flex flex-wrap gap-x-1 gap-y-0.5">
        {line.moves.map((chapterMove, moveIndex) => (
          <MoveButton
            key={`${lineIndex}:${moveIndex}`}
            label={chapterMove.label}
            at={{ line: lineIndex, move: moveIndex }}
            cursor={cursor}
            onJump={onJump}
          />
        ))}
      </div>
    </div>
  );
}

/** The trail to where the board is: the line's prefix, then its moves so
 * far. Both come labeled — this maps, it does not count plies. */
function CurrentLine({
  chapter,
  cursor,
  onJump,
}: {
  chapter: ChapterDetail;
  cursor: Cursor;
  onJump: (cursor: Cursor) => void;
}) {
  const { i18n } = useLingui();
  const trail = trailTo(chapter, cursor);

  return (
    <nav aria-label={i18n._(STUDY_COPY.currentLine)} className="flex flex-wrap gap-1">
      <button
        type="button"
        onClick={() => onJump(null)}
        aria-current={cursor === null ? "step" : undefined}
        className={cn(CHIP, atStartStyle(cursor === null))}
      >
        {i18n._(STUDY_COPY.start)}
      </button>
      {trail.map((entry) => (
        <button
          key={`${entry.at.line}:${entry.at.move}`}
          type="button"
          onClick={() => onJump(entry.at)}
          aria-current={isAt(cursor, entry.at) ? "step" : undefined}
          className={cn(CHIP, "font-mono", trailStyle(isAt(cursor, entry.at)))}
        >
          {entry.label}
        </button>
      ))}
    </nav>
  );
}

/**
 * What the repertoire plays from the position on the board.
 *
 * Study says it out loud — that is the whole difference from Practice,
 * which hides it until you have answered.
 */
function PreparedHere({
  isOwnTurn,
  prepared,
  onPick,
}: {
  isOwnTurn: boolean;
  prepared: ChapterMove["prepared"];
  onPick: (cursor: Cursor) => void;
}) {
  const { i18n } = useLingui();

  if (prepared.length === 0) {
    return <p className="text-muted-foreground text-sm">{i18n._(STUDY_COPY.lineEnds)}</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm">
        {i18n._(isOwnTurn ? STUDY_COPY.yourMove : STUDY_COPY.theirMove)}
      </span>
      {prepared.map((option) => (
        <Button
          key={option.san}
          size="sm"
          variant="secondary"
          aria-label={`${i18n._(STUDY_COPY.preparedMove)}: ${option.san}`}
          onClick={() => onPick(option.at)}
        >
          <code>{option.san}</code>
        </Button>
      ))}
    </div>
  );
}

/**
 * Where the cursor stands, as named states rather than a chain of
 * conditionals inside a class attribute.
 *
 * Outlined, not filled. A solid primary chip is the loudest thing the
 * palette has, and on a screen where a move is highlighted in the trail,
 * again in the tree, beside a primary button and a primary-bordered
 * panel, "everything is emphasised" reads as "nothing is". The border
 * says where you are at the same glance and leaves the accent for
 * things that are actually actions.
 *
 * The transparent border is on every chip, not just the current one, so
 * moving the cursor never shifts a row by a pixel.
 */
const CHIP = "rounded border border-transparent px-1.5 py-0.5 text-sm";

const MOVE_STYLE = {
  current: "border-primary text-primary font-medium",
  walked: "text-foreground hover:bg-muted",
  ahead: "text-muted-foreground hover:bg-muted",
} as const;

function atStartStyle(isCurrent: boolean): string {
  return isCurrent ? MOVE_STYLE.current : MOVE_STYLE.ahead;
}

function trailStyle(isCurrent: boolean): string {
  return isCurrent ? MOVE_STYLE.current : MOVE_STYLE.walked;
}

function isAt(cursor: Cursor, at: MoveCursor): boolean {
  return cursor?.line === at.line && cursor.move === at.move;
}

function MoveButton({
  label,
  at,
  cursor,
  onJump,
}: {
  label: string;
  at: MoveCursor;
  cursor: Cursor;
  onJump: (cursor: Cursor) => void;
}) {
  const isCurrent = isAt(cursor, at);
  const isWalked = cursor?.line === at.line && at.move < cursor.move;

  return (
    <button
      type="button"
      onClick={() => onJump(at)}
      aria-current={isCurrent ? "step" : undefined}
      className={cn(CHIP, "px-1 font-mono", moveStyleOf(isCurrent, isWalked))}
    >
      {label}
    </button>
  );
}

function moveStyleOf(isCurrent: boolean, isWalked: boolean): string {
  if (isCurrent) return MOVE_STYLE.current;
  if (isWalked) return MOVE_STYLE.walked;
  return MOVE_STYLE.ahead;
}

/**
 * The labeled way back to the start: the line's own prefix (the server
 * already wrote it) followed by the moves walked inside this line.
 */
function trailTo(
  chapter: ChapterDetail,
  cursor: Cursor,
): { label: string; at: MoveCursor }[] {
  if (!cursor) return [];
  const line = chapter.lines[cursor.line];
  if (!line) return [];

  const walked = line.moves.slice(0, cursor.move + 1).map((move, index) => ({
    label: move.label,
    at: { line: cursor.line, move: index },
  }));
  return [...line.prefix, ...walked];
}
