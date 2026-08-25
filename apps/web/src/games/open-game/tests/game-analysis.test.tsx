import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  addGames,
  stageAnalysis,
  stageSeatIdentities,
  watchCount,
  type AnalysisAnswer,
} from "../../../test/archive.ts";
import { deviceHasImported } from "../../../test/device.ts";
import { GAME_SANS, ME, aGame, aGradedPly } from "../../../test/games.ts";
import { renderApp } from "../../../test/render.tsx";
import { server } from "../../../test/server.ts";

/**
 * The screen through the route, over HTTP. Opening a game is the whole
 * interaction, so every test navigates and then reads what arrived.
 */

/** The staged run: every ply graded, with one blunder at Nc6 (ply 4). */
const gradedPlies = () =>
  GAME_SANS.map((san, index) =>
    aGradedPly(index + 1, { san, category: index === 3 ? "blunder" : "good" }),
  );

/** Matches a move button by its SAN and the NAG glyph the grade adds. */
const blunderButton = (content: string) =>
  content.includes("Nc6") && content.includes("??");

const openGame = async (
  answer?: AnalysisAnswer,
  identities?: Parameters<typeof stageSeatIdentities>[1],
) => {
  const game = aGame();
  addGames(game);
  if (answer) stageAnalysis(game.id, answer);
  if (identities) stageSeatIdentities(game.id, identities);
  const rendered = await renderApp({ path: `/games/${game.id}` });
  return { game, ...rendered };
};

describe("game analysis", () => {
  beforeEach(() => {
    deviceHasImported();
  });

  it("analyses the game on opening it", async () => {
    const { user } = await openGame({ kind: "stream", moves: gradedPlies() });

    // The blunder carries its glyph on the move itself, in the list the
    // Move tab owns…
    expect(
      await screen.findByRole("button", { name: blunderButton }),
    ).toBeInTheDocument();

    // …and the report tallies it per player: one blunder, and it was
    // Black's (ply 4 is Black's second move).
    await user.click(screen.getByRole("tab", { name: "Report" }));

    const row = (await screen.findByText("Blunder")).closest("div");
    expect(row).toHaveTextContent(/0.*Blunder.*1/);
  });

  it("keeps the scoresheet in Move, where stepping happens", async () => {
    // The list used to sit outside the tabs, so reading the report came
    // with a move-by-move list underneath that had nothing to do with
    // it — and the two then shared one scroll region.
    const { user } = await openGame({ kind: "stream", moves: gradedPlies() });
    await screen.findByRole("button", { name: blunderButton });

    await user.click(screen.getByRole("tab", { name: "Report" }));
    await screen.findByText("Blunder");
    expect(screen.queryByRole("button", { name: blunderButton })).toBeNull();

    // And it comes back with the tab, rather than being gone for good.
    await user.click(screen.getByRole("tab", { name: "Move" }));
    expect(
      await screen.findByRole("button", { name: blunderButton }),
    ).toBeInTheDocument();
  });

  it("opens an already analyzed game straight from the cache", async () => {
    await openGame({ kind: "cached", moves: gradedPlies() });

    expect(
      await screen.findByRole("button", { name: blunderButton }),
    ).toBeInTheDocument();
  });

  it("converges when another caller owns the run", async () => {
    // The POST answers 202; the poll finds the other owner's report and
    // the screen ends where it would have if we had run it ourselves.
    await openGame({ kind: "elsewhere", moves: gradedPlies(), reads: 0 });

    expect(
      await screen.findByRole("button", { name: blunderButton }),
    ).toBeInTheDocument();
  });

  it("steps through the game", async () => {
    const { user } = await openGame({ kind: "stream", moves: gradedPlies() });

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
    const { user } = await openGame({ kind: "stream", moves: gradedPlies() });
    await screen.findByRole("button", { name: blunderButton });

    // Scoped to the board: the insight card names the same move, and the
    // question here is what the *board* is showing.
    const board = screen.getByRole("region", { name: "Board" });
    expect(within(board).getByText("Starting position")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next move" }));
    expect(within(board).getByText("1. e4")).toBeInTheDocument();

    // And jumping, not only stepping — the list is navigation.
    await user.click(screen.getByRole("button", { name: blunderButton }));
    expect(within(board).getByText("2… Nc6")).toBeInTheDocument();
  });

  it("shows the board from the seat you played", async () => {
    // A game you played as Black is read from Black's side, and the
    // opponent sits on top. Getting this backwards makes every position
    // on the screen wrong in a way that looks deliberate.
    const game = aGame({ perspective: "black", whiteName: "magnus", blackName: ME });
    addGames(game);
    stageAnalysis(game.id, { kind: "cached", moves: gradedPlies() });
    await renderApp({ path: `/games/${game.id}` });

    const board = await screen.findByRole("region", { name: "Board" });
    const strips = within(board).getAllByText(/magnus|yurimutti/);
    expect(strips[0]).toHaveTextContent("magnus");
    expect(strips.at(-1)).toHaveTextContent("yurimutti");
  });

  it("gives its place in the trail, back to the games list", async () => {
    const { user } = await openGame({ kind: "cached", moves: gradedPlies() });

    const nav = await screen.findByRole("navigation", { name: "breadcrumb" });
    expect(within(nav).getByRole("link", { name: "Games" })).toHaveAttribute(
      "href",
      "/games",
    );
    expect(within(nav).getByText("yurimutti vs gothamchess")).toBeInTheDocument();

    await user.click(within(nav).getByRole("link", { name: "Games" }));
    expect(await screen.findByRole("heading", { name: "Games" })).toBeInTheDocument();
  });

  it("shows a contextual message when the game itself cannot be loaded", async () => {
    // A hand-typed or stale id. The screen must not sit on a spinner
    // forever, and must not blame the analysis for the game's absence.
    await renderApp({ path: "/games/does-not-exist" });

    expect(await screen.findByText("Couldn't load analysis.")).toBeInTheDocument();
    expect(screen.queryByText("Loading the game…")).toBeNull();
  });

  it("explains the move the board is showing", async () => {
    const { user } = await openGame({ kind: "stream", moves: gradedPlies() });
    await screen.findByRole("button", { name: blunderButton });

    // At the start there is no move to explain, and the card says so
    // rather than going blank.
    expect(screen.getByText("The starting position.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: blunderButton }));

    // The verdict, the evaluation, and what should have been played —
    // and the best move reads as SAN, not as the UCI the engine sent.
    expect(await screen.findByText("is a blunder")).toBeInTheDocument();
    expect(screen.getByText("Evaluation")).toBeInTheDocument();
    expect(screen.getByText("Best was")).toBeInTheDocument();
  });

  it("says how the game ended", async () => {
    await openGame({ kind: "cached", moves: gradedPlies() });

    // The platform's own wording is appended, not translated.
    expect(
      await screen.findByText("White · Victory · by resignation"),
    ).toBeInTheDocument();
  });

  it("shows the moves even while the engine is still working", async () => {
    // An empty run: the stream opens and closes with nothing graded, so
    // this pins that the board and move list never wait on the engine.
    await openGame({ kind: "stream", moves: [] });

    expect(await screen.findByRole("button", { name: /Qxf7#/ })).toBeInTheDocument();
  });

  it("grades each move once, however the stream ends", async () => {
    // The `done` frame repeats every position, so the reader has to know
    // how many it already emitted. Reading that off the wire's `index`
    // counted one short — it is 0-based — and the last move was graded
    // twice. Six good moves and one blunder, and the report says so.
    const { user } = await openGame({ kind: "stream", moves: gradedPlies() });
    await screen.findByRole("button", { name: blunderButton });

    await user.click(screen.getByRole("tab", { name: "Report" }));

    expect((await screen.findByText("Good")).closest("div")).toHaveTextContent(
      /4.*Good.*2/,
    );
    expect(screen.getByText("Blunder").closest("div")).toHaveTextContent(/0.*Blunder.*1/);
  });

  it("reads a stream that splits frames across chunks", async () => {
    // A socket makes no promise that a chunk is a whole frame. Sixteen
    // bytes at a time cuts mid-JSON on every frame, so a reader that
    // parsed per chunk instead of per blank line loses the lot.
    await openGame({ kind: "stream", moves: gradedPlies(), chunkBytes: 16 });

    expect(
      await screen.findByRole("button", { name: blunderButton }),
    ).toBeInTheDocument();
  });

  it("keeps progress up while the rest of the game is still being graded", async () => {
    // `streamedQuery` writes each chunk with `setQueryData`, so the query
    // reports success from the first graded move onward — `isPending` is
    // false for all but the opening instant of a run. A progress bar wired
    // to it vanishes after move one and leaves eighty moves looking idle.
    const moves = gradedPlies();
    moves[0] = aGradedPly(1, { san: GAME_SANS[0]!, category: "blunder" });
    await openGame({ kind: "stream", moves, dropsAfter: 1 });

    // One move graded, the run demonstrably unfinished — and the status
    // says exactly where it is rather than only that it is working.
    await screen.findByRole("button", {
      name: (c) => c.includes("e4") && c.includes("??"),
    });
    expect(screen.getByText("Analyzing move 1 of 7…")).toBeInTheDocument();
  }, 15_000);

  it("delivers each move once when a dropped connection replays the run", async () => {
    // A watch connection that ends mid-run without a terminal frame is a
    // blip, not a failure: the EventSource reconnects and the route starts
    // its replay from the first position. Two things have to hold — the
    // screen must not report the analysis as failed, and the moves it
    // already had must not arrive a second time.
    const { user } = await openGame({
      kind: "stream",
      moves: gradedPlies(),
      dropsAfter: 3,
    });

    // The drop, then the reconnection the EventSource makes on its own.
    await waitFor(() => expect(watchCount()).toBeGreaterThan(1), { timeout: 10_000 });
    await screen.findByRole("button", { name: blunderButton });

    // And the replay did not double anything: six good, one blunder.
    await user.click(screen.getByRole("tab", { name: "Report" }));
    expect((await screen.findByText("Good")).closest("div")).toHaveTextContent(
      /4.*Good.*2/,
    );
  }, 20_000);

  it("lets go of the stream once the run is done, and does not reopen it", async () => {
    // The failure this guards is invisible on screen. An EventSource
    // reconnects on its own whenever the connection ends and nobody closed
    // it — measured at three reconnections in nine seconds — so a run that
    // finished and left the source open is an endless request loop against
    // the engine's trigger. Connections, not pixels, are the only evidence.
    await openGame({ kind: "stream", moves: gradedPlies() });
    await screen.findByRole("button", { name: blunderButton });

    expect(watchCount()).toBe(1);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    });
    expect(watchCount()).toBe(1);
  }, 15_000);

  it("shows a contextual analysis status when analysis fails", async () => {
    await openGame({ kind: "failed" });

    expect(await screen.findByText("Couldn't load analysis.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
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
  });

  it("shows each player's own picture beside their name", async () => {
    await openGame(
      { kind: "cached", moves: gradedPlies() },
      {
        white: { avatarUrl: MY_AVATAR, flair: MY_FLAIR },
        black: { avatarUrl: OPPONENT_AVATAR },
      },
    );

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
    await openGame({ kind: "cached", moves: gradedPlies() });

    const board = await screen.findByRole("region", { name: "Board" });
    for (const name of [ME, "gothamchess"]) {
      const strip = within(board).getByText(name).closest("div")!;
      expect(strip.querySelectorAll("img")).toHaveLength(0);
    }
  });

  it("hides the flair when its asset fails to load", async () => {
    // An asset that 404s must not leave a broken-image glyph where the
    // decoration stood.
    await openGame(
      { kind: "cached", moves: gradedPlies() },
      { white: { flair: MY_FLAIR } },
    );

    const board = await screen.findByRole("region", { name: "Board" });
    const strip = within(board).getByText(ME).closest("div")!;
    const flair = [...strip.querySelectorAll("img")].at(-1)!;

    fireEvent(flair, new Event("error"));

    expect(flair).not.toBeVisible();
  });
});

/**
 * The way out of a report and into practice.
 *
 * All three states are sentences, not numbers: the same zero means
 * "clean game" and "we have not looked yet", and only one of them should
 * read as an invitation.
 */
describe("drill CTA", () => {
  beforeEach(() => {
    deviceHasImported();
  });

  it("offers the count once triage has run", async () => {
    server.use(
      http.get("/api/games/:id/analysis", () =>
        HttpResponse.json({
          status: "completed",
          analysis: { engineVersion: "test", depth: 12, positions: [] },
          drills: { eligible: 5, seeded: 5, triaged: true },
        }),
      ),
    );

    const { user } = await openGame({ kind: "stream", moves: gradedPlies() });
    await user.click(await screen.findByRole("tab", { name: "Report" }));

    expect(await screen.findByText(/5 positions of yours/)).toBeInTheDocument();
  });

  it("does not announce zero while triage is still queued", async () => {
    // The worst state this block can be in: analysis done, triage
    // pending, and the screen telling a blundered game there is nothing
    // to practise.
    server.use(
      http.get("/api/games/:id/analysis", () =>
        HttpResponse.json({
          status: "completed",
          analysis: { engineVersion: "test", depth: 12, positions: [] },
          drills: { eligible: 3, seeded: 0, triaged: false },
        }),
      ),
    );

    const { user } = await openGame({ kind: "stream", moves: gradedPlies() });
    await user.click(await screen.findByRole("tab", { name: "Report" }));

    expect(await screen.findByText(/Working out which positions/)).toBeInTheDocument();
    expect(screen.queryByText(/Drill your mistakes/)).toBeNull();
  });

  it("does not invite you to drill a clean game", async () => {
    server.use(
      http.get("/api/games/:id/analysis", () =>
        HttpResponse.json({
          status: "completed",
          analysis: { engineVersion: "test", depth: 12, positions: [] },
          drills: { eligible: 0, seeded: 0, triaged: true },
        }),
      ),
    );

    const { user } = await openGame({ kind: "stream", moves: gradedPlies() });
    await user.click(await screen.findByRole("tab", { name: "Report" }));

    expect(await screen.findByText("See your patterns")).toBeInTheDocument();
    expect(screen.queryByText(/Drill your mistakes/)).toBeNull();
  });
});
