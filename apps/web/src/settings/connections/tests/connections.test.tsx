import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

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

  it("syncs a single account from its own row", async () => {
    accountIsTracked({ platform: "chess_com", username: "magnus" });

    const { user } = await renderApp({ path: "/settings/connections" });

    await user.click(await screen.findByRole("button", { name: "Sync games" }));

    expect(await screen.findByText("Already up to date")).toBeInTheDocument();
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
});
