import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";

import {
  landSync,
  latestSync,
  refuseRefreshFor,
  scheduleSync,
} from "../../../test/archive.ts";
import { ME } from "../../../test/games.ts";
import { renderApp } from "../../../test/render.tsx";
import {
  accountIsTracked,
  resetTrackedAccounts,
} from "../../../test/handlers/accounts.ts";
import { sessionActive } from "../../../test/handlers/auth.ts";
import { server } from "../../../test/server.ts";

/**
 * Settings → Chess accounts: one row per provider, read at a glance —
 * connected or not, under which handle, and whether a sync is running or
 * failed. Composed from the same tracked-accounts query and mutations the
 * rest of the app already uses — no second source of truth.
 */

async function providerRow(name: "Chess.com" | "Lichess") {
  return within(await screen.findByRole("listitem", { name }));
}

describe("chess accounts", () => {
  beforeEach(() => {
    sessionActive();
    resetTrackedAccounts();
  });

  it("lists every provider with whether it is connected", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus" });

    await renderApp({ path: "/settings/connections" });

    const chessCom = await providerRow("Chess.com");
    expect(chessCom.getByText("magnus")).toBeInTheDocument();
    expect(chessCom.getByText("Connected")).toBeInTheDocument();

    const lichess = await providerRow("Lichess");
    expect(lichess.getByText("Not connected")).toBeInTheDocument();
    expect(lichess.getByRole("button", { name: "Connect Lichess" })).toBeInTheDocument();
  });

  it("shows both handles when both providers are connected", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus" });
    accountIsTracked({ platform: "lichess", username: "hikaru" });

    await renderApp({ path: "/settings/connections" });

    expect((await providerRow("Chess.com")).getByText("magnus")).toBeInTheDocument();
    expect((await providerRow("Lichess")).getByText("hikaru")).toBeInTheDocument();
    expect(screen.queryByText("Not connected")).not.toBeInTheDocument();
  });

  it("says when an account has never synced", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus", lastSyncedAt: null });

    await renderApp({ path: "/settings/connections" });

    expect(
      (await providerRow("Chess.com")).getByText("Not synced yet"),
    ).toBeInTheDocument();
  });

  it("marks an account whose last sync failed", async () => {
    accountIsTracked({
      platform: "lichess",
      username: "hikaru",
      lastSyncError: "not-found",
    });

    await renderApp({ path: "/settings/connections" });

    const lichess = await providerRow("Lichess");
    expect(lichess.getByText("Sync failed")).toBeInTheDocument();
    expect(lichess.queryByText("Connected")).not.toBeInTheDocument();
  });

  it("reads as syncing while the server holds a job for the account", async () => {
    accountIsTracked({ id: "account-1", platform: "chess_com", username: "magnus" });
    scheduleSync("account-1", "manual");

    await renderApp({ path: "/settings/connections" });

    const chessCom = await providerRow("Chess.com");
    expect(chessCom.getByText("Syncing")).toBeInTheDocument();
    expect(chessCom.getByRole("button", { name: "Syncing…" })).toBeDisabled();
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

  it("reads every provider as available when none is connected", async () => {
    await renderApp({ path: "/settings/connections" });

    expect(
      (await providerRow("Chess.com")).getByText("Not connected"),
    ).toBeInTheDocument();
    expect((await providerRow("Lichess")).getByText("Not connected")).toBeInTheDocument();
  });

  it("connects a provider from its own row, without offering the other one", async () => {
    const { user } = await renderApp({ path: "/settings/connections" });

    await user.click(await screen.findByRole("button", { name: "Connect Chess.com" }));

    const dialog = await screen.findByRole("dialog", { name: "Connect Chess.com" });
    expect(within(dialog).queryByRole("tab")).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText("Chess.com username"), ME);
    await user.click(within(dialog).getByRole("button", { name: "Import" }));

    await screen.findByText(ME);
    expect((await providerRow("Chess.com")).getByText(ME)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
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
    expect(
      await (await providerRow("Chess.com")).findByText("Not connected"),
    ).toBeInTheDocument();
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
