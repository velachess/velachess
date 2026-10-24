import "fake-indexeddb/auto";

import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resetAnalysisDbForTests,
  saveReport,
} from "../../../games/analysis/analysis-db.ts";
import { openDB } from "../../../libs/idb.ts";
import { useMyAccounts } from "../../../games/import/index.ts";
import { deviceHasImported } from "../../../test/device.ts";
import { aGradedPly } from "../../../test/games.ts";
import {
  linkedProvidersAre,
  sessionActive,
  TEST_PASSWORD,
} from "../../../test/handlers/auth.ts";
import { renderApp } from "../../../test/render.tsx";
import { server } from "../../../test/server.ts";

const ANALYSIS_DB = "velachess-analysis";

afterEach(async () => {
  vi.restoreAllMocks();
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

async function confirmDeletion(password: string | null = TEST_PASSWORD) {
  const opened = await openDeleteDialog();
  const { user, dialog } = opened;
  if (password !== null) await user.type(dialog.getByLabelText("Password"), password);
  await user.type(dialog.getByLabelText("Type DELETE to confirm"), "DELETE");
  await user.click(dialog.getByRole("button", { name: "Delete account" }));
  return opened;
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

  it.each([
    [400, "INVALID_PASSWORD", "That password isn't right."],
    [
      400,
      "SESSION_EXPIRED",
      "For your security, sign out and sign back in, then try again.",
    ],
    [500, "INTERNAL_SERVER_ERROR", "Couldn't delete your account. Try again."],
  ])(
    "a %i %s refusal keeps the dialog open with its reason and forgets nothing",
    async (status, code, reason) => {
      sessionActive();
      deviceHasImported();
      server.use(
        http.post("/api/auth/delete-user", () => HttpResponse.json({ code }, { status })),
      );

      const { router, dialog } = await confirmDeletion();

      expect(await dialog.findByText(reason)).toBeInTheDocument();
      expect(router.state.location.pathname).toBe("/settings/account");
      expect(useMyAccounts.getState().accounts).not.toEqual([]);
    },
  );

  it("does not take an account it cannot check for a password as passwordless", async () => {
    sessionActive();
    server.use(
      http.get("/api/auth/list-accounts", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    const { user, dialog } = await openDeleteDialog();

    expect(
      await dialog.findByText("Couldn't check how you sign in."),
    ).toBeInTheDocument();
    await user.type(dialog.getByLabelText("Type DELETE to confirm"), "DELETE");
    expect(dialog.getByRole("button", { name: "Delete account" })).toBeDisabled();
  });

  it("asks a Google-only account for no password", async () => {
    sessionActive();
    linkedProvidersAre(["google"]);

    const { router, dialog } = await confirmDeletion(null);

    expect(dialog.queryByLabelText("Password")).not.toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
  });
});

describe("after the account is deleted", () => {
  it("signs out and erases this browser's analysis storage", async () => {
    sessionActive();
    deviceHasImported();
    await saveReport("game-1", [aGradedPly(1)]);
    expect(await analysisDatabases()).toContain(ANALYSIS_DB);

    const { router } = await confirmDeletion();

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(useMyAccounts.getState().accounts).toEqual([]);
    expect(await analysisDatabases()).not.toContain(ANALYSIS_DB);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("warns when another tab keeps the analysis storage from being erased", async () => {
    sessionActive();
    await saveReport("game-1", [aGradedPly(1)]);
    const otherTab = await openDB(ANALYSIS_DB, 1);

    const { router } = await confirmDeletion();

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(
      await screen.findByText(
        "Analyses saved in this browser weren't erased yet: another VelaChess tab is using them. Close your other tabs, or clear this site's data.",
      ),
    ).toBeInTheDocument();
    otherTab.close();
  });

  it("says so when the browser refuses to erase the analysis storage", async () => {
    sessionActive();
    vi.spyOn(indexedDB, "deleteDatabase").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });

    const { router } = await confirmDeletion();

    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(
      await screen.findByText(
        "Analyses saved in this browser couldn't be erased. Clear this site's data to remove them.",
      ),
    ).toBeInTheDocument();
  });
});
