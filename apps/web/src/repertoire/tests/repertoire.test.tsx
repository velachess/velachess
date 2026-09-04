import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { deviceHasImported } from "../../test/device.ts";
import {
  FRENCH_CHAPTER_ID,
  WHITE_REPERTOIRE_ID,
  whiteRepertoireIsConfigured,
} from "../../test/handlers/repertoires.ts";
import { mainContent, renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";

/**
 * The three screens of the repertoire area, through routes and HTTP.
 *
 * The assertions follow the product constraint: White and Black are the
 * two fixed books — always both present, never a third, never a
 * "create repertoire" control — and everything a person manages lives
 * inside them. The vocabulary is part of the contract: Study and
 * Practice, prep gaps and recall failures, adherence. Never "review",
 * never "book", never a generic "train".
 */
describe("the repertoire landing", () => {
  beforeEach(() => {
    deviceHasImported();
  });

  it("always presents White and Black, and offers nothing to create", async () => {
    await renderApp({ path: "/repertoire" });

    const white = await screen.findByRole("region", { name: "White repertoire" });
    const black = screen.getByRole("region", { name: "Black repertoire" });
    expect(black).toBeInTheDocument();

    // The books are derived from games by the sync pipeline: no create
    // control, no extract button, nothing on a card to press. (Scoped to
    // the cards — the shell's own chrome is not this screen's business.)
    for (const card of [white, black]) {
      expect(within(card).queryByRole("button")).not.toBeInTheDocument();
    }
    expect(
      screen.queryByText(/build from my games|paste a pgn/i),
    ).not.toBeInTheDocument();
  });

  it("says an underived side is waiting on games, without asking for anything", async () => {
    await renderApp({ path: "/repertoire" });

    const black = await screen.findByRole("region", { name: "Black repertoire" });
    expect(within(black).getByText("Built from your games")).toBeInTheDocument();
    expect(within(black).queryByRole("link")).not.toBeInTheDocument();
  });

  it("makes the whole card the way in, with the side's state on it", async () => {
    whiteRepertoireIsConfigured();
    await renderApp({ path: "/repertoire" });

    const card = await screen.findByRole("link", { name: "White repertoire" });
    expect(card).toHaveAttribute("href", `/repertoire/${WHITE_REPERTOIRE_ID}`);

    expect(within(card).getByText("2 chapters")).toBeInTheDocument();
    expect(
      within(card).getByText("75% adherence over 24 judged games"),
    ).toBeInTheDocument();
    expect(within(card).getByText("4 positions due")).toBeInTheDocument();
    expect(within(card).getByText("3 prep gaps")).toBeInTheDocument();
  });

  it("clicking a card opens the repertoire, where practice lives", async () => {
    whiteRepertoireIsConfigured();
    const { user } = await renderApp({ path: "/repertoire" });

    await user.click(await screen.findByRole("link", { name: "White repertoire" }));

    expect(await screen.findByText("French Defense")).toBeInTheDocument();
    // Practice is the repertoire's own screen — never the mistake drills.
    expect(screen.getByRole("link", { name: "Practice repertoire" })).toHaveAttribute(
      "href",
      `/repertoire/${WHITE_REPERTOIRE_ID}/practice`,
    );
  });
});

describe("the repertoire detail", () => {
  beforeEach(() => {
    deviceHasImported();
    whiteRepertoireIsConfigured();
  });

  it("lists chapters with their state in words, not a KPI grid", async () => {
    await renderApp({ path: `/repertoire/${WHITE_REPERTOIRE_ID}` });

    expect(await screen.findByText("French Defense")).toBeInTheDocument();
    expect(
      screen.getByText("75% adherence · 3 recall failures · 2 prep gaps"),
    ).toBeInTheDocument();
    expect(screen.getByText("4 due")).toBeInTheDocument();
    expect(screen.getByText("100% adherence · 1 prep gap")).toBeInTheDocument();
  });

  it("makes the chapter card itself the way into Study", async () => {
    await renderApp({ path: `/repertoire/${WHITE_REPERTOIRE_ID}` });

    // The chapter's name IS the link — no separate Open/Study button, and
    // nothing interactive nested inside another interactive element.
    const study = await screen.findByRole("link", { name: "French Defense" });
    expect(study).toHaveAttribute(
      "href",
      `/repertoire/${WHITE_REPERTOIRE_ID}/${FRENCH_CHAPTER_ID}`,
    );
    expect(screen.queryByRole("link", { name: "Study" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open" })).not.toBeInTheDocument();

    // And the ONLY one: a second action on the row competed with the card
    // for the same click. Practising one chapter is offered from inside
    // it. The repertoire-wide action above the list is untouched.
    const row = study.closest("li");
    expect(
      within(row!).queryByRole("link", { name: "Practice" }),
    ).not.toBeInTheDocument();
    expect(within(row!).getAllByRole("link")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Practice repertoire" })).toBeInTheDocument();
  });

  it("says each chapter's state as a tag, coloured by what it means", async () => {
    await renderApp({ path: `/repertoire/${WHITE_REPERTOIRE_ID}` });

    // Overdue is a warning; never-asked is information, not a problem.
    // Neither is the brand colour, which said "important" about both.
    const due = await screen.findByText("4 due");
    expect(due).toHaveAttribute("data-variant", "warning");
    expect(screen.getByText("5 to practice")).toHaveAttribute("data-variant", "info");
  });

  it("offers no way to write a line by hand", async () => {
    await renderApp({ path: `/repertoire/${WHITE_REPERTOIRE_ID}` });
    await screen.findByText("French Defense");

    // Chapters are derived from games; authoring them is not a feature
    // yet, and a control that half-works is worse than none.
    expect(screen.queryByRole("button", { name: /add a line/i })).not.toBeInTheDocument();
  });
});

describe("chapter study", () => {
  beforeEach(() => {
    deviceHasImported();
    whiteRepertoireIsConfigured();
  });

  const open = () =>
    renderApp({ path: `/repertoire/${WHITE_REPERTOIRE_ID}/${FRENCH_CHAPTER_ID}` });

  it("opens straight on the board, at the start of the chapter", async () => {
    await open();

    expect(await screen.findByRole("region", { name: "Board" })).toBeInTheDocument();
    // White to move in a White repertoire: the prepared move is named,
    // not asked — that is the whole difference from Practice.
    expect(screen.getByText("Your repertoire plays:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepared move: e4" })).toBeInTheDocument();
    // The trail says where the board stands, not just to a screen reader.
    expect(screen.getByRole("heading", { name: "Current line" })).toBeInTheDocument();
  });

  it("walks the line forward and back", async () => {
    const { user } = await open();
    await screen.findByRole("region", { name: "Board" });

    const next = screen.getByRole("button", { name: "Next move" });
    await user.click(next); // 1. e4
    await user.click(next); // 1... e6
    await user.click(next); // 2. d4

    const line = screen.getByRole("navigation", { name: "Current line" });
    expect(
      within(line)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Starting position", "1. e4", "e6", "2. d4"]);

    await user.click(screen.getByRole("button", { name: "Previous move" }));
    expect(within(line).getByRole("button", { name: "e6" })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("names the opponent's moves as his, not as your replies", async () => {
    const { user } = await open();
    await screen.findByRole("region", { name: "Board" });

    await user.click(screen.getByRole("button", { name: "Next move" })); // 1. e4

    // Black to move in a White chapter: what is listed are the moves the
    // opponent plays and this chapter answers — never "your replies".
    expect(screen.getByText("Opponent plays:")).toBeInTheDocument();
    expect(screen.queryByText("Your repertoire plays:")).not.toBeInTheDocument();
  });

  it("returns to the start in one control", async () => {
    const { user } = await open();
    await screen.findByRole("region", { name: "Board" });

    const next = screen.getByRole("button", { name: "Next move" });
    await user.click(next);
    await user.click(next);
    await user.click(screen.getByRole("button", { name: "Back to the start" }));

    const line = screen.getByRole("navigation", { name: "Current line" });
    expect(
      within(line)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Starting position"]);
  });

  it("offers both prepared replies where the repertoire branches", async () => {
    const { user } = await open();
    await screen.findByRole("region", { name: "Board" });

    const next = screen.getByRole("button", { name: "Next move" });
    await user.click(next);
    await user.click(next); // after 1... e6 — two prepared answers

    expect(screen.getByText("Your repertoire plays:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prepared move: d4" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Prepared move: Nc3" }),
    ).toBeInTheDocument();
  });

  it("puts the variation tree in the panel and navigates from it", async () => {
    const { user } = await open();
    const panel = await screen.findByRole("complementary", { name: "Chapter" });

    expect(within(panel).getByText("Main line")).toBeInTheDocument();
    await user.click(within(panel).getByRole("button", { name: "2. Nc3" }));

    // The trail shows how the board got here, prefix included.
    const line = screen.getByRole("navigation", { name: "Current line" });
    expect(
      within(line)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Starting position", "1. e4", "e6", "2. Nc3"]);
  });

  // Playing a move ON the board also walks the line — matched against
  // the prepared squares the server sends, so it needs no chess here.
  // Not asserted through the DOM: react-chessboard renders squares as
  // unnamed divs (the same limitation game-analysis.test.tsx records),
  // so there is nothing to click by role. The tree in the panel is the
  // same navigation through a surface a person can actually query.

  it("hands over to Practice for this chapter, not to drills", async () => {
    await open();

    expect(await screen.findByRole("link", { name: "Practice chapter" })).toHaveAttribute(
      "href",
      `/repertoire/${WHITE_REPERTOIRE_ID}/practice?chapter=${FRENCH_CHAPTER_ID}`,
    );
  });
});

describe("repertoire practice", () => {
  beforeEach(() => {
    deviceHasImported();
    whiteRepertoireIsConfigured();
  });

  const queueOf = (due: number, line: number) =>
    http.get("/api/drill/queue", () =>
      HttpResponse.json({
        due,
        fresh: 0,
        byOrigin: {
          "repertoire-deviation": 0,
          "engine-blunder": 0,
          "repertoire-line": line,
        },
      }),
    );

  it("asks for the prepared move, on the same board as Study", async () => {
    server.use(
      queueOf(1, 1),
      http.get("/api/drill/next", () =>
        HttpResponse.json({
          exerciseId: "eeeeeeee-1111-4111-8111-eeeeeeeeeeee",
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          previews: {},
          phase: "due",
          context: {
            origin: "repertoire-line",
            playedSan: null,
            label: "White — French",
          },
        }),
      ),
    );

    await renderApp({ path: `/repertoire/${WHITE_REPERTOIRE_ID}/practice` });

    expect(
      await screen.findByRole("region", { name: "Position to play" }),
    ).toBeInTheDocument();
    // The repertoire's question, not the drill screen's.
    expect(screen.getByText("Play the move you prepared.")).toBeInTheDocument();
    expect(screen.queryByText(/find a better move/i)).not.toBeInTheDocument();

    // The panel carries the session's context — and never the answer.
    const panel = screen.getByRole("complementary", { name: "Practice" });
    expect(within(panel).getByText("1 position due")).toBeInTheDocument();
    expect(within(panel).getByText("0 / 1 completed")).toBeInTheDocument();
    expect(within(panel).queryByText(/prepared move/i)).not.toBeInTheDocument();
  });

  it("says the repertoire is up to date when nothing is due", async () => {
    server.use(
      queueOf(0, 0),
      http.get("/api/drill/next", () => new HttpResponse(null, { status: 204 })),
    );

    await renderApp({ path: `/repertoire/${WHITE_REPERTOIRE_ID}/practice` });

    expect(await screen.findByText("Nothing to practice")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to the repertoire" })).toHaveAttribute(
      "href",
      `/repertoire/${WHITE_REPERTOIRE_ID}`,
    );
  });
});

describe("the scoped drill screen", () => {
  beforeEach(() => {
    deviceHasImported();
  });

  it("passes the URL scope through to the queue it counts", async () => {
    const asked: string[] = [];
    server.use(
      http.get("/api/drill/queue", ({ request }) => {
        asked.push(new URL(request.url).search);
        return HttpResponse.json({
          due: 1,
          fresh: 0,
          byOrigin: {
            "repertoire-deviation": 0,
            "engine-blunder": 0,
            "repertoire-line": 1,
          },
        });
      }),
    );

    await renderApp({ path: `/drill?chapter=${FRENCH_CHAPTER_ID}` });
    await mainContent().findByText("Drill");

    expect(asked.some((search) => search.includes(`chapter=${FRENCH_CHAPTER_ID}`))).toBe(
      true,
    );
  });
});
