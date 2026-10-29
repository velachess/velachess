import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { addGames } from "../../../test/archive.ts";
import { deviceHasImported } from "../../../test/device.ts";
import { ME, aGame } from "../../../test/games.ts";
import { renderApp } from "../../../test/render.tsx";

/**
 * The term is asserted in the URL as well as in the rows: the server
 * narrows, so a term the address bar forgot would come back on the next
 * page turn.
 */
describe("opponent search", () => {
  beforeEach(() => {
    deviceHasImported();
    addGames(aGame({ blackName: "magnuscarlsen" }), aGame({ blackName: "gothamchess" }));
  });

  it("narrows the list to the opponent typed, and remembers the term", async () => {
    const { user, router } = await renderApp();

    expect(await screen.findByText("gothamchess")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Search opponent" }), "magnus");

    // One wait for both: the term is debounced and the narrowed read starts
    // from the skeleton, so for a moment neither row is there.
    await waitFor(() => {
      expect(screen.getByText("magnuscarlsen")).toBeInTheDocument();
      expect(screen.queryByText("gothamchess")).toBeNull();
    });
    expect(router.state.location.searchStr).toContain("opponent=magnus");
  });

  it("never matches your own seat, because the opponent is the other one", async () => {
    const { user } = await renderApp();

    await user.type(screen.getByRole("textbox", { name: "Search opponent" }), ME);

    expect(await screen.findByText("No games match these filters.")).toBeInTheDocument();
  });

  it("widens again from the clear button, which only exists once there is text", async () => {
    const { user, router } = await renderApp();

    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();

    const field = screen.getByRole("textbox", { name: "Search opponent" });
    await user.type(field, "magnus");
    await screen.findByText("magnuscarlsen");

    await user.click(screen.getByRole("button", { name: "Clear search" }));

    expect(await screen.findByText("gothamchess")).toBeInTheDocument();
    expect(field).toHaveValue("");
    expect(router.state.location.searchStr).not.toContain("opponent");
  });

  it("keeps the term that arrived in the URL, in the field and in the rows", async () => {
    await renderApp({ path: "/games?opponent=gotham" });

    expect(await screen.findByText("gothamchess")).toBeInTheDocument();
    expect(screen.queryByText("magnuscarlsen")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Search opponent" })).toHaveValue(
      "gotham",
    );
  });

  it("goes back to the first page, so a narrower search is not an empty page", async () => {
    addGames(...Array.from({ length: 30 }, () => aGame({ blackName: "magnuscarlsen" })));

    const { user, router } = await renderApp({ path: "/games?page=2" });

    await user.type(screen.getByRole("textbox", { name: "Search opponent" }), "gotham");

    await waitFor(() => expect(router.state.location.searchStr).toContain("page=1"));
    expect(await screen.findByText("gothamchess")).toBeInTheDocument();
  });

  it("searches within a filter rather than replacing it", async () => {
    addGames(
      aGame({ result: "0-1", perspective: "white", blackName: "magnuscarlsen-won" }),
    );

    const { user } = await renderApp({ path: "/games?outcome=win" });

    await user.type(screen.getByRole("textbox", { name: "Search opponent" }), "magnus");

    await waitFor(() => {
      expect(screen.getByText("magnuscarlsen")).toBeInTheDocument();
      expect(screen.queryByText("gothamchess")).toBeNull();
    });
    expect(screen.queryByText("magnuscarlsen-won")).not.toBeInTheDocument();
  });
});
