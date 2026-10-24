import "fake-indexeddb/auto";

import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";

import {
  resetAnalysisDbForTests,
  saveReport,
} from "../../../games/analysis/analysis-db.ts";
import { useMyAccounts } from "../../../games/import/index.ts";
import { deviceHasImported } from "../../../test/device.ts";
import { aGradedPly } from "../../../test/games.ts";
import {
  linkedProvidersAre,
  sessionActive,
  sessionIsOld,
  TEST_PASSWORD,
} from "../../../test/handlers/auth.ts";
import { renderApp } from "../../../test/render.tsx";
import { server } from "../../../test/server.ts";

const ANALYSIS_DB = "velachess-analysis";

afterEach(async () => {
  await resetAnalysisDbForTests();
});

async function openDeleteDialog() {
  const rendered = await renderApp({ path: "/settings/account" });
  await rendered.user.click(
    await screen.findByRole("button", { name: "Delete account" }),
  );
  const dialog = await screen.findByRole("alertdialog", { name: "Delete your account?" });
  return { ...rendered, dialog: within(dialog) };
}

async function analysisDatabases() {
  return (await indexedDB.databases()).map((database) => database.name);
}

describe("deleting the account", () => {
  it("lives at the bottom of the account screen, behind a dialog", async () => {
    sessionActive();

    await renderApp({ path: "/settings/account" });

    expect(
      await screen.findByRole("heading", { name: "Danger zone" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("will not delete until DELETE is typed", async () => {
    sessionActive();
    const { user, dialog } = await openDeleteDialog();
    const submit = dialog.getByRole("button", { name: "Delete account" });

    await user.type(dialog.getByLabelText("Password"), TEST_PASSWORD);
    expect(submit).toBeDisabled();
    await user.type(dialog.getByLabelText("Type DELETE to confirm"), "delete");
    expect(submit).toBeDisabled();

    await user.clear(dialog.getByLabelText("Type DELETE to confirm"));
    await user.type(dialog.getByLabelText("Type DELETE to confirm"), "DELETE");
    expect(submit).toBeEnabled();
  });

  it("cancelling closes the dialog and keeps the account", async () => {
    sessionActive();
    const { user, router, dialog } = await openDeleteDialog();

    await user.click(dialog.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe("/settings/account");
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
  });

  it("asks for the password before sending anything", async () => {
    sessionActive();
    const { user, dialog } = await openDeleteDialog();

    await user.type(dialog.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(dialog.getByRole("button", { name: "Delete account" }));

    expect(await dialog.findByText("Enter your password.")).toBeInTheDocument();
  });

  it("stays open and locked while the deletion is in flight", async () => {
    sessionActive();
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => (answer = resolve));
    server.use(
      http.post("/api/auth/delete-user", async () => {
        await answered;
        return HttpResponse.json({ success: true, message: "User deleted" });
      }),
    );
    const { user, router, dialog } = await openDeleteDialog();

    await user.type(dialog.getByLabelText("Password"), TEST_PASSWORD);
    await user.type(dialog.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(dialog.getByRole("button", { name: "Delete account" }));

    expect(await dialog.findByRole("button", { name: "Deleting…" })).toBeDisabled();
    expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(dialog.getByLabelText("Password")).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toHaveAttribute("data-open");

    answer();
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });

  it("says so when the password is wrong, and keeps the dialog open", async () => {
    sessionActive();
    const { user, router, dialog } = await openDeleteDialog();

    await user.type(dialog.getByLabelText("Password"), "not-the-password");
    await user.type(dialog.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(dialog.getByRole("button", { name: "Delete account" }));

    expect(await dialog.findByText("That password isn't right.")).toBeInTheDocument();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/settings/account");
  });

  it("asks a Google-only account on an old session to sign in again", async () => {
    sessionActive();
    linkedProvidersAre(["google"]);
    sessionIsOld();
    const { user, dialog } = await openDeleteDialog();

    expect(dialog.queryByLabelText("Password")).not.toBeInTheDocument();
    await user.type(dialog.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(dialog.getByRole("button", { name: "Delete account" }));

    expect(
      await dialog.findByText(
        "For your security, sign out and sign back in, then try again.",
      ),
    ).toBeInTheDocument();
  });

  it("says so when the server fails, and forgets nothing", async () => {
    sessionActive();
    deviceHasImported();
    server.use(
      http.post("/api/auth/delete-user", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    const { user, dialog } = await openDeleteDialog();

    await user.type(dialog.getByLabelText("Password"), TEST_PASSWORD);
    await user.type(dialog.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(dialog.getByRole("button", { name: "Delete account" }));

    expect(
      await dialog.findByText("Couldn't delete your account. Try again."),
    ).toBeInTheDocument();
    expect(useMyAccounts.getState().accounts).not.toEqual([]);
  });

  it("signs out and forgets this device's copy of the account", async () => {
    sessionActive();
    deviceHasImported();
    await saveReport("game-1", [aGradedPly(1)]);
    expect(await analysisDatabases()).toContain(ANALYSIS_DB);
    const { user, router, dialog } = await openDeleteDialog();

    await user.type(dialog.getByLabelText("Password"), TEST_PASSWORD);
    await user.type(dialog.getByLabelText("Type DELETE to confirm"), "DELETE");
    await user.click(dialog.getByRole("button", { name: "Delete account" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(useMyAccounts.getState().accounts).toEqual([]);
    expect(await analysisDatabases()).not.toContain(ANALYSIS_DB);
  });
});
