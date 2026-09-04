import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { ME } from "../../test/games.ts";
import { accountIsTracked } from "../../test/handlers/accounts.ts";
import { overview } from "../../test/handlers/overview.ts";
import { mainContent, renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";

/**
 * The first minute of a new account, over the real app.
 *
 * The overlay is mounted by the `_app` layout, so these render ordinary
 * screens and assert what covers them — which is the behaviour: an
 * account with no games is not on the dashboard, or the games list, or
 * the drill. It is in setup, wherever it happened to land.
 */

const noGames = () =>
  server.use(http.get("/api/overview", () => HttpResponse.json(overview.empty)));

describe("an account with no games", () => {
  it("meets the setup overlay without asking for it", async () => {
    noGames();

    await renderApp({ path: "/" });

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Your games are the syllabus",
    );
  });

  it("meets it on any screen behind the wall, not just the dashboard", async () => {
    noGames();

    await renderApp({ path: "/drill" });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("cannot dismiss it — there is nothing behind it yet", async () => {
    noGames();

    const { user } = await renderApp({ path: "/" });
    const dialog = await screen.findByRole("dialog");

    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(dialog).toBeInTheDocument();
  });

  it("walks the tour, one slide at a time, into the import", async () => {
    noGames();

    const { user } = await renderApp({ path: "/" });
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByText("Your book, from your own play")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(
      await screen.findByText("Drills from the mistakes that cost you"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("skips straight to the import for somebody who has read it before", async () => {
    noGames();

    const { user } = await renderApp({ path: "/" });
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Skip" }));

    expect(await screen.findByRole("button", { name: "Import" })).toBeInTheDocument();
  });

  it("waits rather than asking again while a sync is in flight", async () => {
    noGames();
    accountIsTracked({ username: "looper", syncState: "active" });

    await renderApp({ path: "/" });

    expect(await screen.findByText("Reading your games")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import" })).not.toBeInTheDocument();
  });

  it("releases the app once the games are in", async () => {
    let imported = false;
    server.use(
      http.get("/api/overview", () =>
        HttpResponse.json(imported ? overview.data : overview.empty),
      ),
    );

    const { user } = await renderApp({ path: "/" });
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "Skip" }));

    await user.type(screen.getByRole("textbox"), ME);
    imported = true;
    await user.click(screen.getByRole("button", { name: "Import" }));

    // Nothing closes it — its reason to exist stops being true.
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("14")).toBeInTheDocument();
  });
});

describe("an account that already has games", () => {
  it("never sees the overlay", async () => {
    // The default handler answers with a filled archive.
    await renderApp({ path: "/" });

    expect(await mainContent().findByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("a backend that failed", () => {
  it("is not mistaken for a new account", async () => {
    // Being told to import what you already imported reads as the app
    // having lost your data. A dash is the honest answer.
    server.use(http.get("/api/overview", () => new HttpResponse(null, { status: 500 })));

    await renderApp({ path: "/" });

    expect(await screen.findAllByText("—")).toHaveLength(4);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
