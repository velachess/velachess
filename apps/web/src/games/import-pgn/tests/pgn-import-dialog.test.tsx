import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { addGames, stagePgnImport } from "../../../test/archive.ts";
import { aGame } from "../../../test/games.ts";
import { renderApp } from "../../../test/render.tsx";

/**
 * The manual import, read the way its user would: a header action that
 * opens a form, ChessBase-style participation (White / Black / By name),
 * a receipt naming every pile, and rows that actually land in the library
 * underneath.
 */

async function openDialog() {
  const { user } = await renderApp();
  await screen.findByText("gothamchess");

  await user.click(screen.getByRole("button", { name: "Import PGN" }));
  return user;
}

/** Pasted, not typed: user.type reads bracket notation as keystrokes. */
const paste = (text: string) => {
  fireEvent.change(screen.getByLabelText("Or paste the moves"), {
    target: { value: text },
  });
};

const VALID_PGN = '[Event "Pasted"]\n\n1. e4 e5 *';
const MULTI_GAME_PGN = `[Event "First"]\n\n1. e4 e5 *\n\n[Event "Second"]\n\n1. d4 d5 *`;

describe("pgn import", () => {
  beforeEach(() => {
    // One row already in the library, so every test opens from a rendered
    // list rather than an empty table.
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

  it("lets you press the same option again to clear it", async () => {
    const user = await openDialog();

    const whiteButton = screen.getByRole("button", { name: "White" });
    await user.click(whiteButton);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    paste(VALID_PGN);
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
    paste(VALID_PGN);

    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
    // The receipt is not enough on its own — the refetched list must
    // carry what landed.
    expect(await screen.findByText("from-the-file")).toBeInTheDocument();
  });

  it("imports with White selected — no name needed", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    paste(VALID_PGN);

    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
    // Picking White never shows the by-name field at all.
    expect(screen.queryByLabelText("Your name in these games")).not.toBeInTheDocument();
  });

  it("imports with Black selected", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "Black" }));
    paste(VALID_PGN);
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
  });

  it("imports a multi-game paste in one go", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    paste(MULTI_GAME_PGN);
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
  });

  it("rejects arbitrary text with an inline error and never saves it", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    paste("adkadsa");

    expect(
      await screen.findByText("Invalid PGN: no valid chess moves found."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    expect(screen.queryByText("Games imported")).not.toBeInTheDocument();
  });

  it("rejects malformed headers the same way", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    paste('[Event "Broken\n[Site "?"]');

    expect(
      await screen.findByText("Invalid PGN: no valid chess moves found."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("rejects a game whose first move is illegal", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    paste('[Event "Illegal"]\n[Result "*"]\n\n1. Nf6 *');

    expect(
      await screen.findByText("Invalid PGN: no valid chess moves found."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("asks the user to choose how they played before importing anything", async () => {
    const user = await openDialog();

    paste(VALID_PGN);
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
    // Clicking a disabled button is a no-op, so submit directly to surface the error.
    fireEvent.submit(screen.getByRole("button", { name: "Import" }).closest("form")!);

    expect(
      await screen.findByText("Choose how you played before importing."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Games imported")).not.toBeInTheDocument();
    void user;
  });

  it("requires a non-empty name once By name is selected", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "By name" }));
    paste(VALID_PGN);

    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();

    fireEvent.submit(screen.getByRole("button", { name: "Import" }).closest("form")!);
    expect(
      await screen.findByText(
        "Enter your name so your games can be told apart from your opponents'.",
      ),
    ).toBeInTheDocument();
  });

  it("treats a whitespace-only name the same as an empty one", async () => {
    await openDialog();

    const byNameButton = screen.getByRole("button", { name: "By name" });
    fireEvent.click(byNameButton);
    fireEvent.change(screen.getByLabelText("Your name in these games"), {
      target: { value: "   " },
    });
    paste(VALID_PGN);

    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("leaves an unmatched by-name game unattributed instead of guessing", async () => {
    // The mock handler doesn't resolve per-game perspective (that's the real
    // backend's job, covered server-side) — this exercises that the client
    // still sends the request once a name is present, regardless of match.
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "By name" }));
    await user.type(screen.getByLabelText("Your name in these games"), "Someone Else");
    paste(VALID_PGN);
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
    void user;
  });

  it("clears the PGN error once the content is corrected", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    paste("adkadsa");
    expect(
      await screen.findByText("Invalid PGN: no valid chess moves found."),
    ).toBeInTheDocument();

    paste(VALID_PGN);
    expect(
      screen.queryByText("Invalid PGN: no valid chess moves found."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeEnabled();
    void user;
  });

  it("accepts a valid .pgn file upload", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    const file = new File([VALID_PGN], "game.pgn", { type: "text/plain" });
    await user.upload(screen.getByLabelText("PGN file"), file);

    expect(await screen.findByRole("button", { name: "Import" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
  });

  it("reports a file it cannot read instead of failing silently", async () => {
    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    const file = new File([VALID_PGN], "game.pgn", { type: "text/plain" });
    vi.spyOn(file, "text").mockRejectedValueOnce(new Error("read failed"));
    await user.upload(screen.getByLabelText("PGN file"), file);

    expect(
      await screen.findByText("Couldn't read that file. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Import" })).toBeDisabled();
  });

  it("counts what was already there and what could not be read", async () => {
    stagePgnImport({
      incoming: [],
      duplicates: 2,
      rejected: 1,
    });

    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    paste('[Event "Duplicate"]\n\n1. d4 d5 *');
    await user.click(screen.getByRole("button", { name: "Import" }));

    const description = await screen.findByText(/already in your library/);
    expect(description.textContent).toContain("2");
    expect(description.textContent).toContain("could not be read");
  });

  it("says the import failed when the server cannot be reached", async () => {
    stagePgnImport({ refuses: true });

    const user = await openDialog();

    await user.click(screen.getByRole("button", { name: "White" }));
    paste('[Event "Doomed"]\n\n1. e4 e5 *');
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Import failed")).toBeInTheDocument();
  });
});
