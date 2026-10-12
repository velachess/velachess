import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import {
  landSync,
  latestSync,
  refuseRefreshFor,
  scheduleSync,
} from "../../../test/archive.ts";
import { renderApp } from "../../../test/render.tsx";
import {
  accountIsTracked,
  resetTrackedAccounts,
} from "../../../test/handlers/accounts.ts";
import { sessionActive } from "../../../test/handlers/auth.ts";
import { server } from "../../../test/server.ts";

/**
 * Settings → Connections: the chess accounts games come from, composed
 * from the same tracked-accounts query and sync mutation the rest of the
 * app already uses — no second source of truth.
 */

describe("connections", () => {
  beforeEach(() => {
    sessionActive();
    resetTrackedAccounts();
  });

  it("lists the accounts the server tracks", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus" });
    accountIsTracked({ platform: "lichess", username: "hikaru" });

    await renderApp({ path: "/settings/connections" });

    expect(await screen.findByText("magnus")).toBeInTheDocument();
    expect(screen.getByText("hikaru")).toBeInTheDocument();
  });

  it("says when an account has never synced", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus", lastSyncedAt: null });

    await renderApp({ path: "/settings/connections" });

    expect(await screen.findByText("Not synced yet")).toBeInTheDocument();
  });

  it("syncs a single account from its own row, and shows it running until the server says it landed", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus" });

    const { user } = await renderApp({ path: "/settings/connections" });

    await user.click(await screen.findByRole("button", { name: "Sync games" }));
    expect(await screen.findByRole("button", { name: "Syncing…" })).toBeDisabled();

    landSync(latestSync().id);

    expect(await screen.findByRole("button", { name: "Sync games" })).toBeEnabled();
  });

  it("shows the domain cooldown as a calm toast, unlike the games page's folded one", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus" });
    refuseRefreshFor(30);

    const { user } = await renderApp({ path: "/settings/connections" });

    await user.click(await screen.findByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Synced a moment ago")).toBeInTheDocument();
    expect(screen.getByText("Try again in 30 seconds.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sync games" })).toBeEnabled();
  });

  it("tells the user once the sync it started finishes", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus" });

    const { user } = await renderApp({ path: "/settings/connections" });

    await user.click(await screen.findByRole("button", { name: "Sync games" }));
    await screen.findByRole("button", { name: "Syncing…" });

    landSync(latestSync().id);

    expect(await screen.findByText("Games synced")).toBeInTheDocument();
  });

  it("stays quiet when a sync nobody clicked this row for lands", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus" });
    const job = scheduleSync("account-1", "connect");

    await renderApp({ path: "/settings/connections" });
    await screen.findByText("magnus");

    landSync(job.id);

    expect(screen.queryByText("Games synced")).not.toBeInTheDocument();
  });

  it("offers the existing connect form to add an account", async () => {
    await renderApp({ path: "/settings/connections" });

    expect(await screen.findByText("Connect an account")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Chess.com username")).toBeInTheDocument();
  });

  it("says so when the list cannot be loaded", async () => {
    server.use(
      http.get("/api/accounts", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );

    await renderApp({ path: "/settings/connections" });

    expect(
      await screen.findByText("Couldn't load your connected accounts."),
    ).toBeInTheDocument();
  });

  it("explains the value of connecting an account once none are", async () => {
    await renderApp({ path: "/settings/connections" });

    expect(await screen.findByText("No chess accounts connected")).toBeInTheDocument();
  });

  it("removes a connection after confirming, and tells the user it worked", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus" });

    const { user } = await renderApp({ path: "/settings/connections" });

    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Disconnect" }));

    expect(await screen.findByText("Remove connection?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove connection" }));

    expect(await screen.findByText("Connection removed")).toBeInTheDocument();
    expect(screen.queryByText("magnus")).not.toBeInTheDocument();
    // The empty state takes its place — nothing left to manage.
    expect(await screen.findByText("No chess accounts connected")).toBeInTheDocument();
  });

  it("cancelling the confirmation leaves the connection untouched", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus" });

    const { user } = await renderApp({ path: "/settings/connections" });

    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Disconnect" }));
    await screen.findByText("Remove connection?");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Remove connection?")).not.toBeInTheDocument();
    expect(screen.getByText("magnus")).toBeInTheDocument();
  });

  it("keeps the connection and reports the error when deleting fails", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus" });
    server.use(
      http.delete("/api/accounts/:id", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );

    const { user } = await renderApp({ path: "/settings/connections" });

    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Disconnect" }));
    await screen.findByText("Remove connection?");
    await user.click(screen.getByRole("button", { name: "Remove connection" }));

    expect(await screen.findByText("Couldn't remove the connection")).toBeInTheDocument();
    expect(screen.getByText("magnus")).toBeInTheDocument();
  });
});
