import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import {
  addGames,
  landSync,
  latestSync,
  scheduleSync,
  stageIncomingGames,
} from "../../test/archive.ts";
import { aGame, ME } from "../../test/games.ts";
import { accountIsTracked } from "../../test/handlers/accounts.ts";
import { sessionActive, TEST_USER } from "../../test/handlers/auth.ts";
import { renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";

/**
 * The overlay is mounted by the `_app` layout, so these render ordinary
 * screens and assert what covers them: an account with no games is in
 * setup, wherever it landed.
 */

describe("an account with no games", () => {
  it("meets the setup overlay without asking for it", async () => {
    await renderApp({ path: "/games", emptyLibrary: true });

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Your games are the syllabus",
    );
  });

  it("meets it on any screen behind the wall, not just the games list", async () => {
    await renderApp({ path: "/import", emptyLibrary: true });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("cannot dismiss it — there is nothing behind it yet", async () => {
    const { user } = await renderApp({ path: "/games", emptyLibrary: true });
    const dialog = await screen.findByRole("dialog");

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
  });

  it("walks the tour, one slide at a time, into the import", async () => {
    const { user } = await renderApp({ path: "/games", emptyLibrary: true });
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      await screen.findByText("Review every game with Stockfish"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("skips straight to the import for somebody who has read it before", async () => {
    const { user } = await renderApp({ path: "/games", emptyLibrary: true });
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(await screen.findByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("waits rather than asking again while a sync is in flight", async () => {
    const account = accountIsTracked({ username: "looper" });
    scheduleSync(account.id, "connect");

    await renderApp({ path: "/games", emptyLibrary: true });

    expect(await screen.findByText("Reading your games")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument();
  });

  it("waits on an import already running when the page loads, and lets go once it lands", async () => {
    // A reload mid-import: the accounts say a sync is on its way, and the
    // stream, not memory or a poll, says when it landed.
    const account = accountIsTracked({ username: "looper" });
    stageIncomingGames(aGame({ whiteName: "looper", blackName: "magnuscarlsen" }));
    const job = scheduleSync(account.id, "connect");

    await renderApp({ path: "/games", emptyLibrary: true });
    expect(await screen.findByText("Reading your games")).toBeInTheDocument();

    landSync(job.id);

    expect(await screen.findByText("magnuscarlsen")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("releases the app once the games are in", async () => {
    const { user } = await renderApp({ path: "/games", emptyLibrary: true });
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Skip" }));

    await user.type(screen.getByRole("textbox"), ME);
    stageIncomingGames(aGame({ whiteName: ME, blackName: "magnuscarlsen" }));
    await user.click(screen.getByRole("button", { name: "Import" }));

    // Connecting schedules the first sync, which the dialog waits on.
    expect(await screen.findByText("Reading your games")).toBeInTheDocument();
    landSync(latestSync().id);

    // Nothing closes it: its reason to exist stops being true.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("magnuscarlsen")).toBeInTheDocument();
  });
});

describe("an account that has onboarded before", () => {
  it("gets the empty library, not the tour, after disconnecting everything", async () => {
    // Removing the last connection looks identical to a brand-new account
    // unless the server remembers.
    sessionActive({ ...TEST_USER, onboardedAt: "2026-01-01T00:00:00.000Z" });

    await renderApp({ path: "/games", emptyLibrary: true });

    expect(
      await screen.findByText(
        "No games yet. Connect Chess.com or Lichess, or import a PGN.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers the way back to a connection from the empty library", async () => {
    sessionActive({ ...TEST_USER, onboardedAt: "2026-01-01T00:00:00.000Z" });

    await renderApp({ path: "/games", emptyLibrary: true });

    expect(
      await screen.findByRole("link", { name: "Connect an account" }),
    ).toHaveAttribute("href", "/import");
  });
});

describe("an account that already has games", () => {
  it("never sees the overlay", async () => {
    addGames(aGame({ whiteName: ME, blackName: "magnuscarlsen" }));

    await renderApp({ path: "/" });

    expect(await screen.findByText("magnuscarlsen")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("a backend that failed", () => {
  it("is not mistaken for a new account", async () => {
    // Being told to import what you already imported reads as lost data.
    server.use(http.get("/api/games", () => new HttpResponse(null, { status: 500 })));

    await renderApp({ path: "/games", emptyLibrary: true });

    await waitFor(() => expect(screen.getByRole("main")).toBeInTheDocument());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
