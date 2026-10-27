import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { addGames } from "../../../test/archive.ts";
import { deviceHasImported, resetDevice } from "../../../test/device.ts";
import { ME, aGame } from "../../../test/games.ts";
import { renderApp } from "../../../test/render.tsx";
import { server } from "../../../test/server.ts";

/**
 * Through a route, over HTTP, reading what a person would read: every
 * assertion is on rendered text or an accessible name, never a handler or a
 * query key. Three cover bugs that shipped green — the seat, the result and
 * the pager — and each shipped
 * because the test underneath it was fed rows made by hand.
 */
describe("games list", () => {
  beforeEach(() => {
    deviceHasImported();
  });

  it("names the opponent, not you", async () => {
    // From the black side, white is the opponent: a list reading `blackName`
    // unconditionally shows the person their own name.
    addGames(aGame({ whiteName: "magnuscarlsen", blackName: ME, perspective: "black" }));

    await renderApp();

    expect(await screen.findByText("magnuscarlsen")).toBeInTheDocument();
    expect(screen.queryByText(ME)).not.toBeInTheDocument();
  });

  it("reads the scoresheet from your side", async () => {
    // 0-1 is a win for black, and reading `result` without `perspective`
    // calls it a loss.
    addGames(aGame({ result: "0-1", perspective: "black", blackName: ME }));

    await renderApp();

    expect(await screen.findByText("Win")).toBeInTheDocument();
  });

  it("says which side you had", async () => {
    addGames(aGame({ perspective: "black", blackName: ME }));

    await renderApp();

    expect(await screen.findByText("You played black")).toBeInTheDocument();
  });

  it("names where each game came from", async () => {
    addGames(
      aGame({ source: "chess_com", whiteName: "from-chess-com" }),
      aGame({ source: "lichess", whiteName: "from-lichess" }),
      aGame({ source: "pgn", whiteName: "from-a-file" }),
    );

    await renderApp();

    expect(await screen.findByText("Chess.com")).toBeInTheDocument();
    expect(screen.getByText("Lichess")).toBeInTheDocument();
    expect(screen.getByText("PGN")).toBeInTheDocument();
  });

  it("calls a game with no result unfinished", async () => {
    addGames(aGame({ result: "*" }));

    await renderApp();

    expect(await screen.findByText("Unfinished")).toBeInTheDocument();
  });

  it("shows the clock and the bucket it falls in", async () => {
    // 2+3 is bullet by its base clock and blitz once the increment counts.
    addGames(aGame({ timeControlInitialSeconds: 120, timeControlIncrementSeconds: 3 }));

    await renderApp();

    expect(await screen.findByText("2 min + 3")).toBeInTheDocument();
    expect(screen.getByText("Blitz")).toBeInTheDocument();
  });

  it("keeps the filter that arrived in the URL", async () => {
    addGames(
      aGame({ result: "1-0", perspective: "white", blackName: "beat-them" }),
      aGame({ result: "0-1", perspective: "white", blackName: "lost-to-them" }),
    );

    await renderApp({ path: "/games?outcome=win" });

    expect(await screen.findByText("beat-them")).toBeInTheDocument();
    expect(screen.queryByText("lost-to-them")).not.toBeInTheDocument();
  });

  it("shows which filter is chosen, at rest and on the closed control", async () => {
    addGames(aGame({ result: "1-0", perspective: "white" }));

    const { user } = await renderApp({ path: "/games?outcome=win" });
    await screen.findByRole("button", { name: /Filters/ });

    // The closed trigger says how many rules narrow the list.
    expect(screen.getByRole("button", { name: /Filters/ })).toHaveTextContent("1");

    await user.click(screen.getByRole("button", { name: /Filters/ }));

    // The chosen chip is pressed, which a stylesheet can colour and used to
    // be indistinguishable from hover.
    expect(await screen.findByRole("button", { name: "Win" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Loss" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("pages through a long archive", async () => {
    addGames(...Array.from({ length: 30 }, () => aGame()));

    const { user } = await renderApp();

    expect(await screen.findByText("1–25 of 30 games")).toBeInTheDocument();

    const next = screen.getByRole("button", { name: "Go to next page" });
    // A real address, so the page survives a refresh or a shared link.
    expect(next).toHaveAttribute("href", "/games?page=2");

    await user.click(next);

    expect(await screen.findByText("26–30 of 30 games")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    // The last page leads nowhere further.
    expect(screen.getByRole("button", { name: "Go to next page" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("says there are no imported games when the library is empty", async () => {
    await renderApp({ emptyLibrary: true });

    expect(
      await screen.findByText(
        "No games yet. Connect Chess.com or Lichess, or import a PGN.",
      ),
    ).toBeInTheDocument();
  });

  it("says the filters matched nothing rather than showing a blank list", async () => {
    addGames(aGame({ result: "1-0", perspective: "white" }));

    await renderApp({ path: "/games?outcome=loss" });

    expect(await screen.findByText("No games match these filters.")).toBeInTheDocument();
  });

  it("says the archive could not be read, and nothing else", async () => {
    server.use(
      http.get("/api/games", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
    );

    await renderApp();

    expect(await screen.findByText("Couldn't load games.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByText("No games match these filters.")).not.toBeInTheDocument();
  });

  it("does not present stale rows as success when a refetch fails", async () => {
    addGames(
      aGame({ result: "0-1", perspective: "white", blackName: "stale-opponent" }),
      aGame({ result: "1-0", perspective: "white", blackName: "fresh-opponent" }),
    );

    const { user } = await renderApp();
    expect(await screen.findByText("stale-opponent")).toBeInTheDocument();

    server.use(
      http.get("/api/games", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
    );

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(await screen.findByRole("button", { name: "Win" }));

    expect(await screen.findByText("Couldn't load games.")).toBeInTheDocument();
    expect(screen.queryByText("stale-opponent")).not.toBeInTheDocument();
    expect(screen.queryByText("fresh-opponent")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByText("No games match these filters.")).not.toBeInTheDocument();
  });

  it("names both players when nothing attributed the game", async () => {
    // An unattributed PGN has no seat of yours: promoting one player to
    // "the opponent" would invent one, and so would a verdict.
    addGames(
      aGame({
        source: "pgn",
        perspective: null,
        result: "1-0",
        whiteName: "anon-white",
        blackName: "anon-black",
      }),
    );

    await renderApp();

    expect(await screen.findByText("anon-white vs anon-black")).toBeInTheDocument();
    expect(screen.getByText("1-0")).toBeInTheDocument();
    expect(screen.queryByText("Win")).not.toBeInTheDocument();
    expect(screen.queryByText("You played white")).not.toBeInTheDocument();
  });

  it("shows the opponent's cached flag, and nothing when there is none", async () => {
    addGames(
      aGame({
        blackName: "flagged",
        blackIdentity: { avatarUrl: null, flair: null, countryCode: "BR" },
      }),
      aGame({ blackName: "unflagged" }),
    );

    await renderApp();

    await screen.findByText("flagged");
    expect(screen.getByRole("img", { name: "Brazil" })).toBeInTheDocument();
    // One game carries a country; the other must not borrow it.
    expect(screen.getAllByRole("img", { name: "Brazil" })).toHaveLength(1);
  });

  it("links each row to its review", async () => {
    addGames(aGame({ blackName: "linked-opponent" }));

    await renderApp();

    // A link, so a keyboard can reach it.
    const link = await screen.findByRole("link", { name: /linked-opponent/ });
    expect(link).toHaveAttribute("href", "/games/game-1");
  });

  it("lists the library and offers both import paths with no account connected", async () => {
    // The unified read does not depend on a remembered handle: a manual
    // import alone is a first-class way to have a library, and both ways
    // to fill it stay reachable from the header.
    resetDevice();
    const { router } = await renderApp();

    expect(router.state.location.pathname).toBe("/games");
    expect(screen.getByRole("button", { name: "Import PGN" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync games" })).toBeInTheDocument();
  });
});
