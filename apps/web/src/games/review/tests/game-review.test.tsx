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
 * The screen through the route, with the engine mocked at
 * `analyzeGameInBrowser` rather than at the Worker, which
 * `libs/infra/engine` and `analysis/tests/` cover.
 */

vi.mock("../../analysis/game/analyze.ts", () => ({
  analyzeGameInBrowser: vi.fn(),
}));
const { analyzeGameInBrowser } = await import("../../analysis/game/analyze.ts");

// Partial: the screen reaches the whole-game pass through this module too,
// so only the interactive evaluator is stubbed.
vi.mock("../../analysis/index.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../analysis/index.ts")>()),
  createStockfishEvaluator: vi.fn(),
}));
const { createStockfishEvaluator } = await import("../../analysis/index.ts");

/** One blunder at Nc6 (ply 4), whose `bestMove` has to be legal there or
 * the insight card renders no suggestion. */
const gradedPlies = () =>
  Array.from({ length: GAME_SANS.length }, (_, index) =>
    aGradedPly(index + 1, index === 3 ? { category: "blunder", bestMove: "g7g6" } : {}),
  );

const blunderButton = (content: string) =>
  content.includes("Nc6") && content.includes("??");

const findBlunderButton = () => screen.findByRole("button", { name: blunderButton });

/** `finished: false` never ends: the engine has not reached the rest of the
 * game. */
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
  // Throws before the pass has a stream to hand back, the shape an
  // unusable browser fails in.
  vi.mocked(analyzeGameInBrowser).mockImplementation(() => {
    throw new Error("engine failed");
  });
}

/** Fails until the test says the engine works, which is what a retry
 * needs: an errored entry is already refetched once when the screen
 * mounts, so a single staged failure never reaches the user. */
function stageRecoverableAnalysis(moves: GradedPly[]) {
  let failing = true;
  const pass = plyPass(moves);

  vi.mocked(analyzeGameInBrowser).mockImplementation(() => {
    if (failing) throw new Error("engine failed");
    return pass();
  });

  return {
    recover() {
      failing = false;
    },
  };
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

    expect(await findBlunderButton()).toBeInTheDocument();

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

    await user.click(screen.getByRole("tab", { name: "Move" }));
    expect(await findBlunderButton()).toBeInTheDocument();
  }, 50_000);

  it("steps through the game", async () => {
    const { user } = await openGame(gradedPlies());

    const previous = await screen.findByRole("button", { name: "Previous move" });
    const next = screen.getByRole("button", { name: "Next move" });
    const firstMove = screen.getByRole("button", { name: /e4/ });

    expect(previous).toBeDisabled();

    await user.click(next);
    expect(firstMove).toHaveAttribute("aria-pressed", "true");

    await user.click(previous);
    expect(firstMove).toHaveAttribute("aria-pressed", "false");

    await user.click(screen.getByRole("button", { name: /Qh5/ }));
    expect(screen.getByRole("button", { name: /Qh5/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("moves the board with the move list", async () => {
    // The squares are unnamed divs, so the live region is what makes the
    // board readable.
    const { user } = await openGame(gradedPlies());
    await findBlunderButton();

    const board = screen.getByRole("region", { name: "Board" });
    expect(within(board).getByText("Starting position")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next move" }));
    expect(within(board).getByText("1. e4")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: blunderButton }));
    expect(within(board).getByText("2… Nc6")).toBeInTheDocument();
  }, 30_000);

  it("shows the board from the seat you played", async () => {
    // Backwards here makes every position wrong in a way that looks
    // deliberate.
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

    const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Games" })).toHaveAttribute(
      "href",
      "/games",
    );
    expect(within(nav).getAllByRole("link")).toHaveLength(1);
    expect(within(nav).getByText("Review")).toHaveAttribute("aria-current", "page");

    await user.click(within(nav).getByRole("link", { name: "Games" }));
    expect(await screen.findByRole("heading", { name: "Games" })).toBeInTheDocument();
  }, 30_000);

  it("shows a contextual message when the game itself cannot be loaded", async () => {
    await renderApp({ path: "/games/does-not-exist" });

    expect(await screen.findByText("Couldn't load this game.")).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load analysis.")).toBeNull();
    expect(screen.queryByText("Loading the game…")).toBeNull();
  });

  it("explains the move the board is showing", async () => {
    const { user } = await openGame(gradedPlies());
    await findBlunderButton();

    expect(screen.getByText("The starting position.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: blunderButton }));

    expect(await screen.findByText("is a blunder")).toBeInTheDocument();
    expect(screen.getByText("Evaluation")).toBeInTheDocument();
    expect(screen.getByText("Best was")).toBeInTheDocument();
  }, 30_000);

  it("offers no suggestion when the report names no best move", async () => {
    // Reports written before `bestMove` became nullable store "" and are
    // still read back from IndexedDB.
    const moves = gradedPlies();
    moves[3] = aGradedPly(4, { category: "blunder", bestMove: "" });
    const { user } = await openGame(moves);

    await user.click(await findBlunderButton());

    expect(await screen.findByText("is a blunder")).toBeInTheDocument();
    expect(screen.queryByText("Best was")).toBeNull();
  }, 20_000);

  it("says how the game ended", async () => {
    await openGame(gradedPlies());

    expect(
      await screen.findByText("White · Victory · by resignation"),
    ).toBeInTheDocument();
  });

  it("shows the moves even while the engine is still working", async () => {
    const { user } = await openGame([]);

    expect(await screen.findByRole("button", { name: /Qxf7#/ })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Report" }));
    const row = (await screen.findByText("Blunder")).closest("div");
    expect(row).toHaveTextContent(/0.*Blunder.*0/);
  });

  it("keeps progress up while the rest of the game is still being graded", async () => {
    const moves = gradedPlies();
    moves[0] = aGradedPly(1, { category: "blunder" });
    vi.mocked(analyzeGameInBrowser).mockImplementation(
      plyPass([moves[0]!], { finished: false }),
    );
    const game = aGame();
    addGames(game);
    await renderApp({ path: `/games/${game.id}` });

    await screen.findByRole("button", {
      name: (c) => c.includes("e4") && c.includes("??"),
    });
    expect(screen.getByText("Analyzing move 1 of 7…")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "14");
  }, 20_000);

  it("reads a game that starts from a position, with Black to play", async () => {
    // With [SetUp]/[FEN], ply 1 is not always White's, so counting
    // half-moves credits every grade to the wrong player.
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

    const nc6 = await screen.findByRole("button", {
      name: (c) => c.includes("Nc6") && c.includes("??"),
    });
    expect(nc6).toBeInTheDocument();
    expect(screen.getByText("2.")).toBeInTheDocument();

    await user.click(nc6);
    expect(await screen.findAllByText(/2… Nc6/)).not.toHaveLength(0);

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

  it("analyses the game again when the failed pass is retried", async () => {
    const game = aGame();
    addGames(game);
    const engine = stageRecoverableAnalysis(gradedPlies());
    const { user } = await renderApp({ path: `/games/${game.id}` });

    await screen.findByText("Couldn't load analysis.");
    engine.recover();
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(await findBlunderButton()).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load analysis.")).toBeNull();
  }, 35_000);

  it("offers no retry while a pass is still streaming", async () => {
    const game = aGame();
    addGames(game);
    vi.mocked(analyzeGameInBrowser).mockImplementation(
      plyPass([aGradedPly(1)], { finished: false }),
    );
    await renderApp({ path: `/games/${game.id}` });

    await screen.findByText("Analyzing move 1 of 7…");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  }, 20_000);

  it("does not leave a previous game's moves on screen after switching games", async () => {
    // A run still going must not render as the open game's. The first pass
    // never ends.
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

/** Dates sit at midday UTC, so the calendar day holds in any timezone. */
describe("game header", () => {
  const PLAYED_AT = "2026-08-22T12:00:00.000Z";

  beforeEach(() => {
    deviceHasImported();
    vi.mocked(analyzeGameInBrowser).mockReset();
  });

  const openHeader = async (overrides: Partial<Game>) => {
    const game = aGame({ playedAt: PLAYED_AT, ...overrides });
    addGames(game);
    stageAnalysis(gradedPlies());
    const rendered = await renderApp({ path: `/games/${game.id}` });
    const title = await screen.findByRole("heading", { level: 1 });
    return { title, ...rendered };
  };

  it("keeps the matchup out of the trail", async () => {
    await openHeader({});

    const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
    expect(nav.textContent).toBe("GamesReview");
  });

  it("names the opponent first when you played white", async () => {
    const { title } = await openHeader({
      whiteName: ME,
      blackName: "grin_gyt",
      perspective: "white",
      result: "0-1",
    });

    expect(title.textContent).toBe("grin_gyt vs you");
    expect(screen.getByText("Aug 22, 2026 · Chess.com · 0–1 Loss")).toBeInTheDocument();
  });

  it("names the opponent first when you played black", async () => {
    const { title } = await openHeader({
      whiteName: "grin_gyt",
      blackName: ME,
      perspective: "black",
      source: "lichess",
      result: "1-0",
    });

    expect(title.textContent).toBe("grin_gyt vs you");
    expect(screen.getByText("Aug 22, 2026 · Lichess · 1–0 Loss")).toBeInTheDocument();
  });

  it("names an imported PGN game by its source", async () => {
    const { title } = await openHeader({ source: "pgn", result: "1/2-1/2" });

    expect(title.textContent).toBe("gothamchess vs you");
    expect(screen.getByText("Aug 22, 2026 · PGN · ½–½ Draw")).toBeInTheDocument();
  });

  it("gives each source its own mark", async () => {
    // Decorative, so it has no accessible handle and its markup is the
    // evidence.
    const icons: (string | undefined)[] = [];
    for (const source of ["chess_com", "lichess", "pgn"] as const) {
      const { title, unmount } = await openHeader({ source });
      icons.push(title.nextElementSibling?.querySelector("svg")?.innerHTML);
      unmount();
    }

    expect(icons.every(Boolean)).toBe(true);
    expect(new Set(icons).size).toBe(3);
  });

  it("shows a dash when the game has no date", async () => {
    await openHeader({ playedAt: null });

    expect(screen.getByText("— · Chess.com · 1–0 Win")).toBeInTheDocument();
  });

  it("says a game with no result yet is unfinished", async () => {
    await openHeader({ result: "*" });

    expect(screen.getByText("Aug 22, 2026 · Chess.com · Unfinished")).toBeInTheDocument();
  });

  it("finds you as black by your tracked account when no seat is stored", async () => {
    const { title } = await openHeader({
      perspective: null,
      whiteName: "magnus",
      blackName: ME,
    });

    expect(title.textContent).toBe("magnus vs you");
    expect(screen.getByText("Aug 22, 2026 · Chess.com · 1–0 Loss")).toBeInTheDocument();
  });

  it("finds you as white by your tracked account when no seat is stored", async () => {
    const { title } = await openHeader({
      perspective: null,
      whiteName: ME,
      blackName: "magnus",
    });

    expect(title.textContent).toBe("magnus vs you");
    expect(screen.getByText("Aug 22, 2026 · Chess.com · 1–0 Win")).toBeInTheDocument();
  });

  it("does not call anyone you when your seat is unknown", async () => {
    // Named on neither side: the board starts at white, and the header
    // neither says whose win it was nor calls anyone you.
    const { title } = await openHeader({
      perspective: null,
      whiteName: "magnus",
      blackName: "hikaru",
      source: "pgn",
    });

    expect(title.textContent).toBe("magnus vs hikaru");
    expect(screen.getByText("Aug 22, 2026 · PGN · 1–0")).toBeInTheDocument();
  });
});

/** Each seat's provider picture, and initials for a seat nobody could
 * resolve. */
describe("provider identity on the board", () => {
  const MY_AVATAR = "https://images.chesscomfiles.com/uploads/v1/user/461825478.test.jpg";
  const MY_FLAIR = "people.santa-claus-light-skin-tone";
  const OPPONENT_AVATAR = "https://images.chesscomfiles.com/uploads/v1/user/rival.jpg";

  beforeAll(() => {
    // jsdom loads no resources, so base-ui's Avatar waits forever on a
    // preload that never fires. Make it say what a browser reports.
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

    const mine = within(board).getByText(ME).closest("div")!;
    expect(
      [...mine.querySelectorAll("img")].map((image) => image.getAttribute("src")),
    ).toEqual([MY_AVATAR, `https://lichess1.org/assets/flair/img/${MY_FLAIR}.webp`]);

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
    // A 404 must not leave a broken-image glyph.
    await openGame(gradedPlies(), { white: { flair: MY_FLAIR } });

    const board = await screen.findByRole("region", { name: "Board" });
    const strip = within(board).getByText(ME).closest("div")!;
    const flair = [...strip.querySelectorAll("img")].at(-1)!;

    fireEvent(flair, new Event("error"));

    expect(flair).not.toBeVisible();
  });
});

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

interface SettledSearch {
  score: { cp: number };
  bestMove: string | null;
}

/** One line of thinking, then whatever the caller answers — or never. */
function drivenSearch(answer: () => Promise<SettledSearch>): PositionSearch {
  async function* search() {
    yield { depth: 4, multipv: 1, score: { cp: 0 }, pv: ["e2e4"] };
    return await answer();
  }
  return Object.assign(search(), { cancel: () => {} });
}

const scriptedSearch = (evaluation: SettledSearch) =>
  drivenSearch(() => Promise.resolve(evaluation));

const unansweredSearch = () => drivenSearch(() => new Promise<SettledSearch>(() => {}));

const failedSearch = () => drivenSearch(() => Promise.reject(new Error("engine died")));

function stageSearches(search: () => PositionSearch): void {
  vi.mocked(createStockfishEvaluator).mockReturnValue({
    evaluate: search,
    dispose: async () => {},
  });
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

    // Neither button steps while a line is on the board.
    expect(screen.getByRole("button", { name: "Previous move" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next move" })).toBeDisabled();

    await user.click(blunder);

    expect(screen.getByRole("button", { name: "Previous move" })).toBeEnabled();
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

  it("claims no number while the line's own search has not answered", async () => {
    stageSearches(unansweredSearch);
    const { user } = await openGame(gradedPlies());

    await user.click(await findBlunderButton());
    await vi.waitFor(() => expect(evaluationReads()).toBe("0.1"));

    await playOnBoard(user, "f1", "b5");

    await vi.waitFor(() => expect(evaluationReads()).toBe("—"));
    expect(
      screen.getByRole("meter", { name: "Evaluation" }).getAttribute("aria-valuenow"),
    ).toBeNull();
  });

  it("keeps claiming nothing as the line moves on without an answer", async () => {
    stageSearches(unansweredSearch);
    const { user } = await openGame(gradedPlies());
    await user.click(await findBlunderButton());

    await playOnBoard(user, "f1", "b5");
    await playOnBoard(user, "a7", "a6");

    expect(evaluationReads()).toBe("—");
  });

  it("claims no number when the line's search dies", async () => {
    stageSearches(failedSearch);
    const { user } = await openGame(gradedPlies());
    await user.click(await findBlunderButton());

    await playOnBoard(user, "f1", "b5");

    expect(await screen.findAllByText(/Bb5/)).not.toHaveLength(0);
    await vi.waitFor(() => expect(evaluationReads()).toBe("—"));
  });
});
