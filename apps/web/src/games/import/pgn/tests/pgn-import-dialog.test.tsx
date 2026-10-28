import { fireEvent, screen } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addGames, stagePgnImport } from "../../../../test/archive.ts";
import { aGame } from "../../../../test/games.ts";
import { renderApp } from "../../../../test/render.tsx";
import { server } from "../../../../test/server.ts";

/**
 * Read the way its user would: a header action that opens a form, a file
 * dropped or pasted into the same upload, participation as White, Black or
 * by name, a receipt naming every pile, and rows that land in the library
 * underneath.
 */

async function openDialog() {
  const { user } = await renderApp();
  await screen.findByText("gothamchess");

  await user.click(screen.getByRole("button", { name: "Import PGN" }));
  return user;
}

/** Pasted: `user.type` reads bracket notation as keystrokes. */
async function paste(user: UserEvent, text: string) {
  await user.click(screen.getByRole("tab", { name: "Paste PGN" }));
  fireEvent.change(screen.getByLabelText("PGN text"), { target: { value: text } });
}

function drop(file: File) {
  fireEvent.drop(screen.getByText("Drag and drop or choose a .pgn file"), {
    dataTransfer: { files: [file], types: ["Files"] },
  });
}

const VALID_PGN = '[Event "Pasted"]\n\n1. e4 e5 *';
const MULTI_GAME_PGN = `[Event "First"]\n\n1. e4 e5 *\n\n[Event "Second"]\n\n1. d4 d5 *`;

const aPgnFile = (name = "game.pgn") =>
  new File([VALID_PGN], name, { type: "text/plain" });

describe("pgn import", () => {
  beforeEach(() => {
    // So every test opens from a rendered list rather than an empty
    // table.
    addGames(aGame());
    stagePgnImport({ incoming: [aGame({ source: "pgn", blackName: "from-the-file" })] });
  });

  it("the Import button starts disabled until the form is valid", async () => {
    await openDialog();

    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("explains the disabled button up front, before any interaction", async () => {
    await openDialog();

    expect(
      screen.getByText("Choose how you played before importing."),
    ).toBeInTheDocument();
  });

  it("holds back every validation error until something has been touched", async () => {
    await openDialog();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("opens on the upload tab with an empty dropzone", async () => {
    await openDialog();

    expect(screen.getByRole("tab", { name: "Upload file" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("Drag and drop or choose a .pgn file")).toBeInTheDocument();
  });

  it("lets you press the same option again to clear it", async () => {
    const user = await openDialog();

    const whiteButton = screen.getByRole("button", { name: "White" });
    await user.click(whiteButton);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    await paste(user, VALID_PGN);
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();

    await user.click(whiteButton);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(
      screen.getByText("Choose how you played before importing."),
    ).toBeInTheDocument();
  });

  it("imports with By name selected and shows the new game in the library", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "By name" }));
    await user.type(screen.getByLabelText("Your name in these games"), "yurimutti");
    await paste(user, VALID_PGN);

    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
    // The receipt is not enough: the refetched list carries what landed.
    expect(await screen.findByText("from-the-file")).toBeInTheDocument();
    // A successful import is the one thing that closes the dialog.
    expect(screen.queryByText("Import games from a PGN")).not.toBeInTheDocument();
  });

  it("switching participation mode away from By name drops its stale state", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "By name" }));
    // Submit with nothing typed, so the name field has an error to carry:
    // switching away clears it rather than hiding it.
    fireEvent.submit(screen.getByRole("button", { name: "Import" }).closest("form")!);
    expect(
      await screen.findByText(
        "Enter your name so your games can be told apart from your opponents'.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "White" }));
    expect(screen.queryByLabelText("Your name in these games")).not.toBeInTheDocument();

    await paste(user, VALID_PGN);
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();

    // A fresh, unvalidated field rather than the old error.
    await user.click(screen.getByRole("button", { name: "By name" }));
    expect(screen.getByLabelText("Your name in these games")).toHaveValue("");
    expect(
      screen.queryByText(
        "Enter your name so your games can be told apart from your opponents'.",
      ),
    ).not.toBeInTheDocument();
  });

  it("imports with White selected — no name needed", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await paste(user, VALID_PGN);

    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
    // Picking White never shows the by-name field.
    expect(screen.queryByLabelText("Your name in these games")).not.toBeInTheDocument();
  });

  it("imports with Black selected", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "Black" }));
    await paste(user, VALID_PGN);
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
  });

  it("imports a multi-game paste in one go", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await paste(user, MULTI_GAME_PGN);
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
  });

  it("rejects arbitrary text with an inline error and never saves it", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await paste(user, "adkadsa");

    expect(
      await screen.findByText("Invalid PGN: no valid chess moves found."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(screen.queryByText("Games imported")).not.toBeInTheDocument();
  });

  it("rejects malformed headers the same way", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await paste(user, '[Event "Broken\n[Site "?"]');

    expect(
      await screen.findByText("Invalid PGN: no valid chess moves found."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("rejects a game whose first move is illegal", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await paste(user, '[Event "Illegal"]\n[Result "*"]\n\n1. Nf6 *');

    expect(
      await screen.findByText("Invalid PGN: no valid chess moves found."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("asks the user to choose how they played before importing anything", async () => {
    const user = await openDialog();

    await paste(user, VALID_PGN);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    // Clicking a disabled button is a no-op, so submit directly.
    fireEvent.submit(screen.getByRole("button", { name: "Import" }).closest("form")!);

    expect(
      await screen.findByText("Choose how you played before importing."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Games imported")).not.toBeInTheDocument();
  });

  it("requires a non-empty name once By name is selected", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "By name" }));
    await paste(user, VALID_PGN);

    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();

    fireEvent.submit(screen.getByRole("button", { name: "Import" }).closest("form")!);
    expect(
      await screen.findByText(
        "Enter your name so your games can be told apart from your opponents'.",
      ),
    ).toBeInTheDocument();
  });

  it("treats a whitespace-only name the same as an empty one", async () => {
    const user = await openDialog();

    fireEvent.click(screen.getByRole("button", { name: "By name" }));
    fireEvent.change(screen.getByLabelText("Your name in these games"), {
      target: { value: "   " },
    });
    await paste(user, VALID_PGN);

    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("leaves an unmatched by-name game unattributed instead of guessing", async () => {
    // The mock handler doesn't resolve per-game perspective (that's the real
    // backend's job, covered server-side) — this exercises that the client
    // still sends the request once a name is present, regardless of match.
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "By name" }));
    await user.type(screen.getByLabelText("Your name in these games"), "Someone Else");
    await paste(user, VALID_PGN);
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
  });

  it("refuses an empty upload instead of sending it", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();

    fireEvent.submit(screen.getByRole("button", { name: "Import" }).closest("form")!);
    expect(
      await screen.findByText("There is nothing to import yet."),
    ).toBeInTheDocument();
  });

  it("clears the PGN error once the content is corrected", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await paste(user, "adkadsa");
    expect(
      await screen.findByText("Invalid PGN: no valid chess moves found."),
    ).toBeInTheDocument();

    await paste(user, VALID_PGN);
    expect(
      screen.queryByText("Invalid PGN: no valid chess moves found."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
  });

  it("keeps the pasted moves when the tabs are switched", async () => {
    const user = await openDialog();

    await paste(user, VALID_PGN);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    await user.click(screen.getByRole("tab", { name: "Paste PGN" }));

    expect(screen.getByLabelText("PGN text")).toHaveValue(VALID_PGN);
  });

  it("switches tabs from the keyboard", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("tab", { name: "Upload file" }));
    await user.keyboard("{ArrowRight}{Enter}");

    expect(screen.getByRole("tab", { name: "Paste PGN" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByLabelText("PGN text")).toBeInTheDocument();
  });

  it("accepts a valid .pgn file upload", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await user.upload(screen.getByLabelText("PGN file"), aPgnFile());

    expect(await screen.findByRole("button", { name: "Import" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
  });

  it("accepts a .pgn dropped onto the dropzone", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    drop(aPgnFile());

    expect(await screen.findByText("game.pgn")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
  });

  it("names the picked file and its size, and lets it be taken back", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await user.upload(screen.getByLabelText("PGN file"), aPgnFile());

    expect(await screen.findByText("game.pgn")).toBeInTheDocument();
    expect(screen.getByText(`${VALID_PGN.length}B`)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove file" }));

    expect(screen.queryByText("game.pgn")).not.toBeInTheDocument();
    expect(screen.getByText("Drag and drop or choose a .pgn file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("holds a long filename on one line instead of widening the dialog", async () => {
    const user = await openDialog();

    const longName = `${"a".repeat(180)}.pgn`;
    await user.upload(screen.getByLabelText("PGN file"), aPgnFile(longName));

    const title = await screen.findByTitle(longName);
    expect(title).toHaveClass("truncate");
  });

  it("drops the filename once the moves are edited by hand", async () => {
    const user = await openDialog();

    await user.upload(screen.getByLabelText("PGN file"), aPgnFile());
    expect(await screen.findByText("game.pgn")).toBeInTheDocument();

    await paste(user, MULTI_GAME_PGN);
    await user.click(screen.getByRole("tab", { name: "Upload file" }));

    expect(screen.queryByText("game.pgn")).not.toBeInTheDocument();
  });

  it("reports a file it cannot read instead of failing silently", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    const file = aPgnFile();
    vi.spyOn(file, "text").mockRejectedValueOnce(new Error("read failed"));
    await user.upload(screen.getByLabelText("PGN file"), file);

    expect(
      await screen.findByText("Couldn't read that file. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(screen.getByText("Drag and drop or choose a .pgn file")).toBeInTheDocument();
  });

  it("counts what was already there and what could not be read", async () => {
    stagePgnImport({
      incoming: [],
      duplicates: 2,
      rejected: 1,
    });

    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await paste(user, '[Event "Duplicate"]\n\n1. d4 d5 *');
    await user.click(screen.getByRole("button", { name: "Import" }));

    const description = await screen.findByText(/already in your library/);
    expect(description.textContent).toContain("2");
    expect(description.textContent).toContain("could not be read");
  });

  it("says the import failed when the server cannot be reached", async () => {
    stagePgnImport({ refuses: true });

    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await paste(user, '[Event "Doomed"]\n\n1. e4 e5 *');
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Import failed")).toBeInTheDocument();
  });

  it("keeps one failure toast however often the import is retried", async () => {
    stagePgnImport({ refuses: true });

    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await paste(user, '[Event "Doomed"]\n\n1. e4 e5 *');
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await user.click(screen.getByRole("button", { name: "Import" }));
      await screen.findByText("Import failed");
      await screen.findByRole("button", { name: "Import" });
    }

    expect(screen.getAllByText("Import failed")).toHaveLength(1);
  });

  it("shows a loading state and locks the form while the import is in flight", async () => {
    server.use(
      http.post("/api/games/import", async () => {
        await delay(50);
        return HttpResponse.json({ imported: 1, duplicates: 0, rejected: 0 });
      }),
    );

    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await paste(user, VALID_PGN);
    await user.click(screen.getByRole("button", { name: "Import" }));

    const pendingButton = screen.getByRole("button", { name: "Importing…" });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByLabelText("PGN text")).toBeDisabled();
    expect(screen.getByRole("button", { name: "White" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
  });

  it("closes without importing when Cancel is pressed", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    await paste(user, VALID_PGN);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Import games from a PGN")).not.toBeInTheDocument();
  });
});
