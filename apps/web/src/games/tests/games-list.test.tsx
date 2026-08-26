import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { addGames } from "../../test/archive.ts";
import { deviceHasImported, resetDevice } from "../../test/device.ts";
import { ME, aGame } from "../../test/games.ts";
import { renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";

/**
 * The games list, exercised the way it is used: through a route, over
 * HTTP, reading what a person would read.
 *
 * Every assertion here is on rendered text or an accessible name, never
 * on a handler or a query key. Three of these cover bugs that shipped
 * green — the seat, the result and the pager — and each one shipped
 * because the test underneath it was fed rows made by hand.
 */
describe("games list", () => {
  beforeEach(() => {
    deviceHasImported();
  });

  it("names the opponent, not you", async () => {
    // Played from the black side: white is the opponent. A list that
    // reads `blackName` unconditionally shows the person their own name.
    addGames(aGame({ whiteName: "magnuscarlsen", blackName: ME, perspective: "black" }));

    await renderApp();

    expect(await screen.findByText("magnuscarlsen")).toBeInTheDocument();
    expect(screen.queryByText(ME)).not.toBeInTheDocument();
  });

  it("reads the scoresheet from your side", async () => {
    // 0-1 is a loss for white and a win for black. Reading `result`
    // without `perspective` calls this a loss.
    addGames(aGame({ result: "0-1", perspective: "black", blackName: ME }));

    await renderApp();

    expect(await screen.findByText("Win")).toBeInTheDocument();
  });

  it("says which side you had", async () => {
    addGames(aGame({ perspective: "black", blackName: ME }));

    await renderApp();

    expect(await screen.findByLabelText("You played black")).toBeInTheDocument();
  });

  it("calls a game with no result unfinished", async () => {
    addGames(aGame({ result: "*" }));

    await renderApp();

    expect(await screen.findByText("Unfinished")).toBeInTheDocument();
  });

  it("shows the clock and the bucket it falls in", async () => {
    // 2+3 is bullet by its base clock alone and blitz once the increment
    // is counted — the case that tells the two readings apart.
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

    // The closed trigger says the list is narrowed, and by how many rules.
    expect(screen.getByText("1")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Filters/ }));

    // Inside, the chosen chip is pressed — the state a stylesheet can
    // colour, and the one that used to be indistinguishable from hover.
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

    expect(await screen.findByText("1–25 / 30")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("26–30 / 30")).toBeInTheDocument();
    // The last page is the last page: there is nowhere further to go.
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("says there are no imported games when the library is empty", async () => {
    await renderApp();

    expect(
      await screen.findByText(
        "No games yet. Connect Chess.com or Lichess, or import a PGN.",
      ),
    ).toBeInTheDocument();
  });

  it("says the filters matched nothing rather than showing a blank table", async () => {
    addGames(aGame({ result: "1-0", perspective: "white" }));

    await renderApp({ path: "/games?outcome=loss" });

    expect(await screen.findByText("No games match these filters.")).toBeInTheDocument();
  });

  it("shows one table error row when the archive could not be read", async () => {
    server.use(
      http.get("/api/games", () => HttpResponse.json({ error: "boom" }, { status: 500 })),
    );

    await renderApp();

    expect(await screen.findByText("Couldn't load games.")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Opponent" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Result" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByText("No games match these filters.")).not.toBeInTheDocument();
    expect(screen.queryByText("No games imported yet.")).not.toBeInTheDocument();
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
    expect(screen.getByRole("columnheader", { name: "Opponent" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Result" })).toBeInTheDocument();
    expect(screen.queryByText("stale-opponent")).not.toBeInTheDocument();
    expect(screen.queryByText("fresh-opponent")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByText("No games match these filters.")).not.toBeInTheDocument();
    expect(screen.queryByText("No games imported yet.")).not.toBeInTheDocument();
  });

  it("links each row to its review", async () => {
    addGames(aGame({ blackName: "linked-opponent" }));

    await renderApp();

    // A link, not a click handler: navigation a keyboard can reach.
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
