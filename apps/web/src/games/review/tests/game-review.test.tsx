import { fireEvent, screen, within } from "@testing-library/react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { addGames, stageMovetext, stageSeatIdentities } from "../../../test/archive.ts";
import { deviceHasImported } from "../../../test/device.ts";
import { GAME_SANS, ME, aGame, aGradedPly } from "../../../test/games.ts";
import { renderApp } from "../../../test/render.tsx";
import {
  ANALYSIS_EVENT,
  type AnalysisEvent,
  type GradedPly,
  type PositionSearch,
} from "../../analysis/index.ts";
import type { Game } from "../../list/index.ts";

/**
 * The screen through the route, over HTTP for the game itself; the engine
 * is mocked at `analyzeGameInBrowser` — the stream React Query consumes —
 * rather than at the Worker/UCI level, which `libs/infra/engine` and
 * `analysis/tests/analyze-in-browser.test.ts` already cover.
 */

vi.mock("../../analysis/game/analyze.ts", () => ({
  analyzeGameInBrowser: vi.fn(),
}));
const { analyzeGameInBrowser } = await import("../../analysis/game/analyze.ts");

// Partial: the screen reaches the whole-game pass through this module as
// well, and only the interactive evaluator is stubbed.
vi.mock("../../analysis/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../analysis/index.ts")>()),
  createStockfishEvaluator: vi.fn(),
}));
const { createStockfishEvaluator } = await import("../../analysis/index.ts");

/**
 * The staged run: every ply graded, with one blunder at Nc6 (ply 4).
 * Its `bestMove` has to be legal in the position that ply is about —
 * the insight card reads the FEN from the replay, and would render no
 * suggestion for a move that cannot be played there.
 */
const gradedPlies = () =>
  Array.from({ length: GAME_SANS.length }, (_, index) =>
    aGradedPly(index + 1, index === 3 ? { category: "blunder", bestMove: "g7g6" } : {}),
  );

/** Matches a move button by its SAN and the NAG glyph the grade adds. */
const blunderButton = (content: string) =>
  content.includes("Nc6") && content.includes("??");

const findBlunderButton = () => screen.findByRole("button", { name: blunderButton });

/**
 * Streams exactly these plies, as `analyzeGameInBrowser` would.
 * `finished: false` never ends — standing in for "the engine hasn't
 * finished the rest of the game yet".
 */
function plyPass(moves: GradedPly[], { finished = true }: { finished?: boolean } = {}) {
  return async function* (): AsyncGenerator<AnalysisEvent> {
    for (const grade of moves) yield { type: ANALYSIS_EVENT.PLY_GRADED, grade };
    if (!finished) await new Promise<never>(() => {});
    yield { type: ANALYSIS_EVENT.COMPLETED, graded: moves };
  };
}

function stageAnalysis(moves: GradedPly[]): void {
  vi.mocked(analyzeGameInBrowser).mockImplementation(plyPass(moves));
}

function stageFailedAnalysis(): void {
  // Throws where the pass would open the engine, before it has a stream
  // to hand back — the shape an unusable browser really fails in.
  vi.mocked(analyzeGameInBrowser).mockImplementation(() => {
    throw new Error("engine failed");
  });
}

const openGame = async (
  moves?: GradedPly[],
  identities?: Parameters<typeof stageSeatIdentities>[1],
) => {
  const game = aGame();
  addGames(game);
  if (moves) stageAnalysis(moves);
  if (identities) stageSeatIdentities(game.id, identities);
  const rendered = await renderApp({ path: `/games/${game.id}` });
  return { game, ...rendered };
};

describe("game analysis", () => {
  beforeEach(() => {
    deviceHasImported();
    vi.mocked(analyzeGameInBrowser).mockReset();
  });

  it("analyses the game on opening it", async () => {
    const { user } = await openGame(gradedPlies());

    // The blunder carries its glyph on the move itself, in the list the
    // Move tab owns…
    expect(await findBlunderButton()).toBeInTheDocument();

    // …and the report tallies it per player: one blunder, and it was
    // Black's (ply 4 is Black's second move).
    await user.click(screen.getByRole("tab", { name: "Report" }));

    const row = (await screen.findByText("Blunder", {}, { timeout: 15_000 })).closest(
      "div",
    );
    expect(row).toHaveTextContent(/0.*Blunder.*1/);
  }, 35_000);

  it("keeps the scoresheet in Move, where stepping happens", async () => {
    const { user } = await openGame(gradedPlies());
    await findBlunderButton();

    await user.click(screen.getByRole("tab", { name: "Report" }));
    await screen.findByText("Blunder", {}, { timeout: 15_000 });
    expect(screen.queryByRole("button", { name: blunderButton })).toBeNull();

    // And it comes back with the tab, rather than being gone for good.
    await user.click(screen.getByRole("tab", { name: "Move" }));
    expect(await findBlunderButton()).toBeInTheDocument();
  }, 50_000);

  // Not re-running the engine for an already-analyzed game is
  // `staleTime: Infinity` on a React-Query-cached query — standard cache
  // behavior, not custom logic — and isn't independently checked here:
  // `renderApp` hands every call a fresh `QueryClient`, so two calls in
  // one test can't observe cache reuse the way reopening a game in the
  // same running app would.

  it("steps through the game", async () => {
    const { user } = await openGame(gradedPlies());

    const previous = await screen.findByRole("button", { name: "Previous move" });
    const next = screen.getByRole("button", { name: "Next move" });
    // The move number lives in the row's `#` column now, so a move cell is
    // found by its SAN alone.
    const firstMove = screen.getByRole("button", { name: /e4/ });

    // Before the first move there is nothing to go back to.
    expect(previous).toBeDisabled();

    await user.click(next);
    expect(firstMove).toHaveAttribute("aria-pressed", "true");

    await user.click(previous);
    expect(firstMove).toHaveAttribute("aria-pressed", "false");

    // Jumping straight to a move works too — the list is navigation.
    await user.click(screen.getByRole("button", { name: /Qh5/ }));
    expect(screen.getByRole("button", { name: /Qh5/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("moves the board with the move list", async () => {
    // The board is the thing on this screen, and until now nothing
    // asserted it. It could not be asserted: the squares are a grid of
    // unnamed divs, so a person using a screen reader also heard nothing
    // when they stepped. Both gaps were the same gap, and the live region
    // that fixed one is what makes this readable.
    const { user } = await openGame(gradedPlies());
    await findBlunderButton();

    // Scoped to the board: the insight card names the same move, and the
    // question here is what the *board* is showing.
    const board = screen.getByRole("region", { name: "Board" });
    expect(within(board).getByText("Starting position")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next move" }));
    expect(within(board).getByText("1. e4")).toBeInTheDocument();

    // And jumping, not only stepping — the list is navigation.
    await user.click(screen.getByRole("button", { name: blunderButton }));
    expect(within(board).getByText("2… Nc6")).toBeInTheDocument();
  }, 30_000);

  it("shows the board from the seat you played", async () => {
    // A game you played as Black is read from Black's side, and the
    // opponent sits on top. Getting this backwards makes every position
    // on the screen wrong in a way that looks deliberate.
    const game = aGame({ perspective: "black", whiteName: "magnus", blackName: ME });
    addGames(game);
    stageAnalysis(gradedPlies());
    await renderApp({ path: `/games/${game.id}` });

    const board = await screen.findByRole("region", { name: "Board" });
    const strips = within(board).getAllByText(/magnus|yurimutti/);
    expect(strips[0]).toHaveTextContent("magnus");
    expect(strips.at(-1)).toHaveTextContent("yurimutti");
  });

  it("gives its place in the trail, back to the games list", async () => {
    const { user } = await openGame(gradedPlies());
    await findBlunderButton();

    const nav = await screen.findByRole("navigation", { name: "breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Games" })).toHaveAttribute(
      "href",
      "/games",
    );
    // The date is left loose here: its exact rendering is pinned, at a
    // timezone-safe hour, in the breadcrumb tests below.
    expect(within(nav).getAllByRole("link").at(-1)?.textContent).toMatch(
      /^gothamchess vs you · .+ · Chess\.com · 1-0$/,
    );

    await user.click(within(nav).getByRole("link", { name: "Games" }));
    expect(await screen.findByRole("heading", { name: "Games" })).toBeInTheDocument();
  }, 30_000);

  it("shows a contextual message when the game itself cannot be loaded", async () => {
    // A hand-typed or stale id. The screen must not sit on a spinner
    // forever, and must not blame the analysis for the game's absence.
    await renderApp({ path: "/games/does-not-exist" });

    expect(await screen.findByText("Couldn't load analysis.")).toBeInTheDocument();
    expect(screen.queryByText("Loading the game…")).toBeNull();
  });

  it("explains the move the board is showing", async () => {
    const { user } = await openGame(gradedPlies());
    await findBlunderButton();

    // At the start there is no move to explain, and the card says so
    // rather than going blank.
    expect(screen.getByText("The starting position.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: blunderButton }));

    // The verdict, the evaluation, and what should have been played —
    // and the best move reads as SAN, not as the UCI the engine sent.
    expect(await screen.findByText("is a blunder")).toBeInTheDocument();
    expect(screen.getByText("Evaluation")).toBeInTheDocument();
    expect(screen.getByText("Best was")).toBeInTheDocument();
  }, 30_000);

  it("offers no suggestion when the report names no best move", async () => {
    // A report written before `bestMove` became nullable stores "" for
    // absent, and reports already in IndexedDB are still read back.
    const moves = gradedPlies();
    moves[3] = aGradedPly(4, { category: "blunder", bestMove: "" });
    const { user } = await openGame(moves);

    await user.click(await findBlunderButton());

    expect(await screen.findByText("is a blunder")).toBeInTheDocument();
    expect(screen.queryByText("Best was")).toBeNull();
  }, 20_000);

  it("says how the game ended", async () => {
    await openGame(gradedPlies());

    // The platform's own wording is appended, not translated.
    expect(
      await screen.findByText("White · Victory · by resignation"),
    ).toBeInTheDocument();
  });

  it("shows the moves even while the engine is still working", async () => {
    // An empty run: it opens and closes with nothing graded, so this
    // pins that the board and move list never wait on the engine.
    const { user } = await openGame([]);

    expect(await screen.findByRole("button", { name: /Qxf7#/ })).toBeInTheDocument();

    // The report counts from zero rather than standing in for itself —
    // a placeholder swapped for the table later moves every row.
    await user.click(screen.getByRole("tab", { name: "Report" }));
    const row = (await screen.findByText("Blunder")).closest("div");
    expect(row).toHaveTextContent(/0.*Blunder.*0/);
  });

  it("keeps progress up while the rest of the game is still being graded", async () => {
    const moves = gradedPlies();
    moves[0] = aGradedPly(1, { category: "blunder" });
    // The rest of the game doesn't arrive within this test — the run is
    // demonstrably still in progress, not finished short.
    vi.mocked(analyzeGameInBrowser).mockImplementation(
      plyPass([moves[0]!], { finished: false }),
    );
    const game = aGame();
    addGames(game);
    await renderApp({ path: `/games/${game.id}` });

    // One move graded, the run demonstrably unfinished — and the status
    // says exactly where it is rather than only that it is working.
    await screen.findByRole("button", {
      name: (c) => c.includes("e4") && c.includes("??"),
    });
    expect(screen.getByText("Analyzing move 1 of 7…")).toBeInTheDocument();
    // 1 of 7, as a whole percent — the bar moves with the count, it is
    // not just spinning.
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "14");
  }, 20_000);

  it("reads a game that starts from a position, with Black to play", async () => {
    // A PGN import can carry [SetUp]/[FEN], so ply 1 is not always
    // White's: counting half-moves would credit every grade to the wrong
    // player and number every move one too low.
    const game = aGame({ whiteName: "white_player", blackName: "black_player" });
    addGames(game);
    stageMovetext(
      game.id,
      [
        '[Event "From Position"]',
        '[SetUp "1"]',
        '[FEN "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2"]',
        "",
        "2... Nc6 3. Nf3 *",
      ].join("\n"),
    );
    stageAnalysis([
      aGradedPly(1, { category: "blunder" }),
      aGradedPly(2, { category: "good" }),
    ]);
    const { user } = await renderApp({ path: `/games/${game.id}` });

    // The scoresheet opens at move 2, with nothing in White's column.
    const nc6 = await screen.findByRole("button", {
      name: (c) => c.includes("Nc6") && c.includes("??"),
    });
    expect(nc6).toBeInTheDocument();
    expect(screen.getByText("2.")).toBeInTheDocument();

    // The insight and the board's live region both name it as Black's
    // move of move 2, not White's of move 1.
    await user.click(nc6);
    expect(await screen.findAllByText(/2… Nc6/)).not.toHaveLength(0);

    // And the blunder is Black's, which is who actually played it.
    await user.click(screen.getByRole("tab", { name: "Report" }));
    const row = (await screen.findByText("Blunder")).closest("div");
    expect(row).toHaveTextContent(/0.*Blunder.*1/);
  }, 20_000);

  it("shows a contextual analysis status when analysis fails", async () => {
    const game = aGame();
    addGames(game);
    stageFailedAnalysis();
    await renderApp({ path: `/games/${game.id}` });

    expect(await screen.findByText("Couldn't load analysis.")).toBeInTheDocument();
  });

  it("does not leave a previous game's moves on screen after switching games", async () => {
    // The pass's own lifecycle is covered in
    // `analysis/tests/analyze-in-browser.test.ts` and
    // `game-analysis-query.test.ts`; here the concern is purely the
    // screen's: a run that is still going must never render as if it
    // belonged to whatever game is open now. The first game's pass never
    // grades anything and never ends on its own.
    const first = aGame();
    addGames(first);
    vi.mocked(analyzeGameInBrowser).mockImplementation(plyPass([], { finished: false }));
    await renderApp({ path: `/games/${first.id}` });
    await screen.findByRole("button", { name: "Previous move" });

    const second = aGame();
    addGames(second);
    stageAnalysis(gradedPlies());
    await renderApp({ path: `/games/${second.id}` });

    expect(await findBlunderButton()).toBeInTheDocument();
  }, 30_000);
});

/**
 * The last crumb names the game being read: who you played, when, where,
 * and how it ended. Each case reads the text off the trail the way a
 * person would, so a rule that drifts in the screen fails by name.
 *
 * Dates sit at midday UTC so the calendar day holds in any timezone a
 * developer's machine happens to be set to.
 */
describe("game breadcrumb", () => {
  const PLAYED_AT = "2026-08-22T12:00:00.000Z";

  beforeEach(() => {
    deviceHasImported();
    vi.mocked(analyzeGameInBrowser).mockReset();
  });

  /** Renders the game and hands back its last crumb: the page's own name, not the trail leading to it. */
  const openCrumb = async (overrides: Partial<Game>) => {
    const game = aGame({ playedAt: PLAYED_AT, ...overrides });
    addGames(game);
    stageAnalysis(gradedPlies());
    const rendered = await renderApp({ path: `/games/${game.id}` });
    const nav = await screen.findByRole("navigation", { name: "breadcrumb" });
    // The trail's last link: both it and "Games" are `aria-current`, so the
    // page itself is told apart by coming last.
    return { crumb: within(nav).getAllByRole("link").at(-1)!, ...rendered };
  };

  it("names the opponent first when you played white", async () => {
    const { crumb } = await openCrumb({
      whiteName: ME,
      blackName: "grin_gyt",
      perspective: "white",
      result: "0-1",
    });

    expect(crumb.textContent).toBe("grin_gyt vs you · 8/22/2026 · Chess.com · 0-1");
  });

  it("names the opponent first when you played black", async () => {
    const { crumb } = await openCrumb({
      whiteName: "grin_gyt",
      blackName: ME,
      perspective: "black",
      source: "lichess",
      result: "1-0",
    });

    expect(crumb.textContent).toBe("grin_gyt vs you · 8/22/2026 · Lichess · 1-0");
  });

  it("names an imported PGN game by its source", async () => {
    const { crumb } = await openCrumb({ source: "pgn", result: "1/2-1/2" });

    expect(crumb.textContent).toBe("gothamchess vs you · 8/22/2026 · PGN · 1/2-1/2");
  });

  it("gives each source its own mark", async () => {
    // The mark is decorative — the name stands right beside it — so it has
    // no accessible handle to find it by; its markup is the only evidence.
    // A PGN file carries one too: the library table marks it, and the trail
    // reads from the same catalogue rather than deciding again.
    const icons: (string | undefined)[] = [];
    for (const source of ["chess_com", "lichess", "pgn"] as const) {
      const { crumb, unmount } = await openCrumb({ source });
      icons.push(crumb.querySelector("svg")?.innerHTML);
      unmount();
    }

    expect(icons.every(Boolean)).toBe(true);
    expect(new Set(icons).size).toBe(3);
  });

  it("shows a dash when the game has no date", async () => {
    const { crumb } = await openCrumb({ playedAt: null });

    expect(crumb.textContent).toBe("gothamchess vs you · — · Chess.com · 1-0");
  });

  it("shows * for a game with no result yet", async () => {
    const { crumb } = await openCrumb({ result: "*" });

    expect(crumb.textContent).toBe("gothamchess vs you · 8/22/2026 · Chess.com · *");
  });

  it("finds you as black by your tracked account when no seat is stored", async () => {
    const { crumb } = await openCrumb({
      perspective: null,
      whiteName: "magnus",
      blackName: ME,
    });

    expect(crumb.textContent).toBe("magnus vs you · 8/22/2026 · Chess.com · 1-0");
  });

  it("finds you as white by your tracked account when no seat is stored", async () => {
    const { crumb } = await openCrumb({
      perspective: null,
      whiteName: ME,
      blackName: "magnus",
    });

    expect(crumb.textContent).toBe("magnus vs you · 8/22/2026 · Chess.com · 1-0");
  });

  it("does not call anyone you when your seat is unknown", async () => {
    // A PGN that names you on neither side. The board falls back to white
    // so it has somewhere to start; the trail would be stating a fact.
    const { crumb } = await openCrumb({
      perspective: null,
      whiteName: "magnus",
      blackName: "hikaru",
      source: "pgn",
    });

    expect(crumb.textContent).toBe("magnus vs hikaru · 8/22/2026 · PGN · 1-0");
  });
});

/**
 * Provider identity reaches the board: the game detail payload carries
 * each seat's provider picture — both players, tracked account or not —
 * and a seat nobody could resolve stays on initials.
 */
describe("provider identity on the board", () => {
  const MY_AVATAR = "https://images.chesscomfiles.com/uploads/v1/user/461825478.test.jpg";
  const MY_FLAIR = "people.santa-claus-light-skin-tone";
  const OPPONENT_AVATAR = "https://images.chesscomfiles.com/uploads/v1/user/rival.jpg";

  beforeAll(() => {
    // jsdom loads no resources, so base-ui's Avatar waits forever on a
    // preload that never fires and mounts no <img>. A loaded picture is
    // what a real browser reports; make jsdom say the same.
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        complete = true;
        naturalWidth = 64;
      },
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    deviceHasImported();
    vi.mocked(analyzeGameInBrowser).mockReset();
  });

  it("shows each player's own picture beside their name", async () => {
    await openGame(gradedPlies(), {
      white: { avatarUrl: MY_AVATAR, flair: MY_FLAIR },
      black: { avatarUrl: OPPONENT_AVATAR },
    });

    const board = await screen.findByRole("region", { name: "Board" });

    // White by default — my strip sits at the bottom of the board region.
    const mine = within(board).getByText(ME).closest("div")!;
    expect(
      [...mine.querySelectorAll("img")].map((image) => image.getAttribute("src")),
    ).toEqual([MY_AVATAR, `https://lichess1.org/assets/flair/img/${MY_FLAIR}.webp`]);

    // The opponent was never connected; their identity came from the
    // profile cache all the same.
    const theirs = within(board).getByText("gothamchess").closest("div")!;
    const sources = [...theirs.querySelectorAll("img")].map((image) =>
      image.getAttribute("src"),
    );
    expect(sources).toEqual([OPPONENT_AVATAR]);
  });

  it("leaves a seat with no resolvable profile on initials alone", async () => {
    await openGame(gradedPlies());

    const board = await screen.findByRole("region", { name: "Board" });
    for (const name of [ME, "gothamchess"]) {
      const strip = within(board).getByText(name).closest("div")!;
      expect(strip.querySelectorAll("img")).toHaveLength(0);
    }
  });

  it("hides the flair when its asset fails to load", async () => {
    // An asset that 404s must not leave a broken-image glyph where the
    // decoration stood.
    await openGame(gradedPlies(), { white: { flair: MY_FLAIR } });

    const board = await screen.findByRole("region", { name: "Board" });
    const strip = within(board).getByText(ME).closest("div")!;
    const flair = [...strip.querySelectorAll("img")].at(-1)!;

    fireEvent(flair, new Event("error"));

    expect(flair).not.toBeVisible();
  });
});

/**
 * Trying a move out on the board.
 *
 * The board is a third-party widget whose squares carry no accessible
 * name — its own ids are the only handle a click has, which is why this
 * is the one place in the suite that reaches for the DOM directly.
 */
/** Pick the piece up, then click where it goes — the board's own click-to-move. */
async function playOnBoard(
  user: Awaited<ReturnType<typeof openGame>>["user"],
  from: string,
  to: string,
): Promise<void> {
  for (const square of [from, to]) {
    const element = document.getElementById(`chessboard-square-${square}`);
    if (!element) throw new Error(`no square ${square} on the board`);
    await user.click(element);
  }
}

const evaluationReads = () =>
  screen.getByRole("meter", { name: "Evaluation" }).getAttribute("aria-valuetext");

/** One variation search: a line of thinking, then the number. The bar
 * reads what the search settled on, never a provisional update. */
function scriptedSearch(evaluation: {
  score: { cp: number };
  bestMove: string;
}): PositionSearch {
  async function* search() {
    yield { depth: 4, multipv: 1, score: evaluation.score, pv: [evaluation.bestMove] };
    return evaluation;
  }
  return Object.assign(search(), { cancel: () => {} });
}

describe("a variation played on the board", () => {
  beforeEach(() => {
    deviceHasImported();
    vi.mocked(analyzeGameInBrowser).mockReset();
    vi.mocked(createStockfishEvaluator).mockReset();
    vi.mocked(createStockfishEvaluator).mockReturnValue({
      evaluate: () => scriptedSearch({ score: { cp: -480 }, bestMove: "e7e5" }),
      dispose: async () => {},
    });
  });

  it("moves the bar to the variation's own evaluation", async () => {
    const { user } = await openGame(gradedPlies());
    await findBlunderButton();
    // Nothing has been played, so the bar reads level.
    expect(evaluationReads()).toBe("0.0");

    await playOnBoard(user, "e2", "e4");

    await vi.waitFor(() => expect(evaluationReads()).toBe("4.8"));
  });

  it("will not step the game forward while the line is on the board", async () => {
    const { user } = await openGame(gradedPlies());
    await findBlunderButton();

    await playOnBoard(user, "e2", "e4");

    expect(screen.getByRole("button", { name: "Next move" })).toBeDisabled();
  });

  it("leaves the line on the scoresheet, with the controls frozen until then", async () => {
    const { user } = await openGame(gradedPlies());
    const blunder = await findBlunderButton();

    await playOnBoard(user, "e2", "e4");

    // The game's timeline is not where the line lives, so neither button
    // steps while it is on the board.
    expect(screen.getByRole("button", { name: "Previous move" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next move" })).toBeDisabled();

    await user.click(blunder);

    expect(screen.getByRole("button", { name: "Previous move" })).toBeEnabled();
    // Back to the report's own reading for the position on screen.
    await vi.waitFor(() => expect(evaluationReads()).toBe("0.1"));
  });

  it("stops explaining the real game's move, which is not what is on screen", async () => {
    const { user } = await openGame(gradedPlies());
    await findBlunderButton();
    expect(screen.getByText("The starting position.")).toBeInTheDocument();

    await playOnBoard(user, "e2", "e4");

    expect(screen.queryByText("The starting position.")).toBeNull();
    expect(screen.queryByText("Best was")).toBeNull();
  });
});
