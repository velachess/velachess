import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { addGames, stagePgnImport } from "../../../test/archive.ts";
import { aGame } from "../../../test/games.ts";
import { renderApp } from "../../../test/render.tsx";

/**
 * The manual import, read the way its user would: a header action that
 * opens a form, a receipt naming every pile, and rows that actually land
 * in the library underneath.
 */
describe("pgn import", () => {
  beforeEach(() => {
    // One row already in the library, so every test opens from a rendered
    // list rather than an empty table.
    addGames(aGame());
    stagePgnImport({ incoming: [aGame({ source: "pgn", blackName: "from-the-file" })] });
  });

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

  it("imports a pasted file and shows the new game in the library", async () => {
    const user = await openDialog();

    await user.type(screen.getByLabelText("Your name in these games"), "yurimutti");
    paste('[Event "Pasted"]\n\n1. e4 e5 *');
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Games imported")).toBeInTheDocument();
    // The receipt is not enough on its own — the refetched list must
    // carry what landed.
    expect(await screen.findByText("from-the-file")).toBeInTheDocument();
  });

  it("asks for the player name before importing anything", async () => {
    const user = await openDialog();

    paste('[Event "Pasted"]\n\n1. e4 e5 *');
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(
      await screen.findByText(
        "Enter your name so your games can be told apart from your opponents'.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Games imported")).not.toBeInTheDocument();
  });

  it("refuses an empty upload instead of sending it", async () => {
    const user = await openDialog();

    await user.type(screen.getByLabelText("Your name in these games"), "yurimutti");
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(
      await screen.findByText("There is nothing to import yet."),
    ).toBeInTheDocument();
  });

  it("counts what was already there and what could not be read", async () => {
    stagePgnImport({
      incoming: [],
      duplicates: 2,
      rejected: 1,
    });

    const user = await openDialog();

    await user.type(screen.getByLabelText("Your name in these games"), "yurimutti");
    paste('[Event "Duplicate"]\n\n1. d4 d5 *');
    await user.click(screen.getByRole("button", { name: "Import" }));

    const description = await screen.findByText(/already in your library/);
    expect(description.textContent).toContain("2");
    expect(description.textContent).toContain("could not be read");
  });

  it("says the import failed when the server cannot be reached", async () => {
    stagePgnImport({ refuses: true });

    const user = await openDialog();

    await user.type(screen.getByLabelText("Your name in these games"), "yurimutti");
    paste('[Event "Doomed"]\n\n1. e4 e5 *');
    await user.click(screen.getByRole("button", { name: "Import" }));

    expect(await screen.findByText("Import failed")).toBeInTheDocument();
  });
});
