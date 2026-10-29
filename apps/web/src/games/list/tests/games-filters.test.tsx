import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { addGames } from "../../../test/archive.ts";
import { deviceHasImported } from "../../../test/device.ts";
import { aGame } from "../../../test/games.ts";
import { renderApp } from "../../../test/render.tsx";

/**
 * Filtering, driven the way a person drives it: open the popover, press a
 * chip, read the table.
 *
 * The URL is asserted alongside the rows because that is the whole reason
 * filters live there — a narrowed view has to survive a refresh, the back
 * button and a shared link, and rows alone would pass with the state kept
 * in `useState`.
 */
describe("games filters", () => {
  beforeEach(() => {
    deviceHasImported();
    addGames(
      aGame({ result: "1-0", perspective: "white", blackName: "beat-them" }),
      aGame({ result: "0-1", perspective: "white", blackName: "lost-to-them" }),
    );
  });

  it("narrows the list and writes the choice into the URL", async () => {
    const { user, router } = await renderApp();

    expect(await screen.findByText("lost-to-them")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(await screen.findByRole("button", { name: "Win" }));

    expect(await screen.findByText("beat-them")).toBeInTheDocument();
    expect(screen.queryByText("lost-to-them")).not.toBeInTheDocument();
    expect(router.state.location.searchStr).toContain("outcome=win");
  });

  it("lets you press the same chip to clear it", async () => {
    // A filter with no way back off is a trap — the only exit would be
    // editing the address bar.
    const { user } = await renderApp({ path: "/games?outcome=win" });

    // The count sits inside the trigger, so its accessible name is
    // "Filters 1" once anything is active.
    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Win" }));

    expect(await screen.findByText("lost-to-them")).toBeInTheDocument();
  });

  it("returns to the first page when the list narrows", async () => {
    // Narrowing while parked on page 2 shows an empty table and reads as
    // a broken filter rather than a short result.
    const { user, router } = await renderApp({ path: "/games?page=2" });

    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(await screen.findByRole("button", { name: "Win" }));

    expect(await screen.findByText("beat-them")).toBeInTheDocument();
    expect(router.state.location.searchStr).toContain("page=1");
  });

  it("counts the active filters on the trigger", async () => {
    await renderApp({ path: "/games?outcome=win&color=white" });

    const trigger = await screen.findByRole("button", { name: /Filters/ });
    expect(trigger).toHaveTextContent("2");
  });

  it("resets every choice at once, and offers nothing to reset before one is made", async () => {
    const { user, router } = await renderApp({ path: "/games?outcome=win&color=white" });

    await user.click(await screen.findByRole("button", { name: /Filters/ }));
    await user.click(await screen.findByRole("button", { name: "Reset" }));

    expect(await screen.findByText("lost-to-them")).toBeInTheDocument();
    expect(router.state.location.searchStr).not.toContain("outcome");
    expect(router.state.location.searchStr).not.toContain("color");
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });
});

describe("the time control filter", () => {
  beforeEach(() => {
    deviceHasImported();
    addGames(
      aGame({ blackName: "a-bullet-game", timeControlInitialSeconds: 60 }),
      aGame({ blackName: "a-blitz-game", timeControlInitialSeconds: 300 }),
      aGame({ blackName: "a-rapid-game", timeControlInitialSeconds: 600 }),
    );
  });

  it("takes more than one class at a time, as one rule", async () => {
    const { user } = await renderApp();

    await user.click(await screen.findByRole("button", { name: "Filters" }));
    await user.click(await screen.findByRole("checkbox", { name: "Blitz" }));
    await user.click(screen.getByRole("checkbox", { name: "Rapid" }));

    expect(await screen.findByText("a-blitz-game")).toBeInTheDocument();
    expect(screen.getByText("a-rapid-game")).toBeInTheDocument();
    expect(screen.queryByText("a-bullet-game")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Filters/ })).toHaveTextContent("1");
  });

  it("survives a shared link, and unticking the last class widens again", async () => {
    const { user } = await renderApp({ path: '/games?timeClass=["blitz"]' });

    expect(await screen.findByText("a-blitz-game")).toBeInTheDocument();
    expect(screen.queryByText("a-rapid-game")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Filters/ }));
    await user.click(await screen.findByRole("checkbox", { name: "Blitz" }));

    expect(await screen.findByText("a-rapid-game")).toBeInTheDocument();
  });
});

describe("the source filter", () => {
  beforeEach(() => {
    deviceHasImported();
    addGames(
      aGame({ source: "chess_com", blackName: "from-chess-com" }),
      aGame({ source: "pgn", perspective: "white", blackName: "from-a-file" }),
    );
  });

  it("keeps the rows from one source and names the choice", async () => {
    const { user, router } = await renderApp();

    await user.click(await screen.findByRole("button", { name: "Filters" }));

    const sources = await screen.findByRole("combobox", { name: "Source" });
    expect(sources).toHaveTextContent("All sources");

    await user.click(sources);
    await user.click(await screen.findByRole("option", { name: "PGN" }));

    expect(await screen.findByText("from-a-file")).toBeInTheDocument();
    expect(screen.queryByText("from-chess-com")).not.toBeInTheDocument();
    expect(router.state.location.searchStr).toContain("source=pgn");
  });
});
