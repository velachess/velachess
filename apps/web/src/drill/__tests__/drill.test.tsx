import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { deviceHasImported } from "../../test/device.ts";
import { drillItem } from "../../test/handlers/drill.ts";
import { renderApp, renderInApp } from "../../test/render.tsx";
import { DrillPrompt } from "../drill-prompt.tsx";
import { server } from "../../test/server.ts";

/**
 * The drill screen, through a route and over HTTP.
 *
 * The assertions here are on what a person reads, because the two things
 * this screen can get wrong are both sentences: naming the wrong pile, and
 * explaining a drill with the wrong origin's words.
 */
describe("drill", () => {
  beforeEach(() => {
    deviceHasImported();
  });

  it("answers only whether there is something to drill now", () => {
    // One card, one question. Splitting the pile by origin made this a
    // library to browse; provenance is not a choice anyone arrives
    // wanting to make.
    return renderApp({ path: "/drill" }).then(async () => {
      expect(await screen.findByText("12 to drill")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Start drilling" })).toBeInTheDocument();
    });
  });

  it("says what kind of session it is", async () => {
    // Reviews and new positions are different work — recall you have done
    // before against something never asked.
    await renderApp({ path: "/drill" });

    expect(await screen.findByText("7 reviews · 5 new")).toBeInTheDocument();
  });

  it("leaves out the half of the session that is empty", async () => {
    server.use(
      http.get("/api/drill/queue", () =>
        HttpResponse.json({
          due: 0,
          fresh: 3,
          byOrigin: { "repertoire-deviation": 3, "engine-blunder": 0 },
        }),
      ),
    );

    await renderApp({ path: "/drill" });

    // "0 reviews · 3 new" is a word in the way of the one that counts.
    expect(await screen.findByText("3 new")).toBeInTheDocument();
  });

  it("shows a contextual message when drills cannot be read", async () => {
    server.use(
      http.get("/api/drill/queue", () => new HttpResponse(null, { status: 500 })),
    );

    await renderApp({ path: "/drill" });

    expect(await screen.findByText("Couldn't load drills.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing due today")).not.toBeInTheDocument();
  });

  it("shows where you are in the session and how to leave", async () => {
    // Leaving has a consequence — the rest stays due — so it is a named
    // decision rather than a close icon.
    await renderApp({ path: "/drill" });
    await userEvent.click(await screen.findByRole("button", { name: "Start drilling" }));

    expect(await screen.findByText("1 / 12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "End session" })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Progress" })).toBeInTheDocument();
  });

  it("goes back to the pile when the session is ended", async () => {
    await renderApp({ path: "/drill" });
    await userEvent.click(await screen.findByRole("button", { name: "Start drilling" }));
    await userEvent.click(await screen.findByRole("button", { name: "End session" }));

    expect(
      await screen.findByRole("button", { name: "Start drilling" }),
    ).toBeInTheDocument();
  });

  it("says the session is complete rather than showing an empty board", async () => {
    server.use(
      http.get("/api/drill/next", () => new HttpResponse(null, { status: 204 })),
    );

    await renderApp({ path: "/drill" });
    await userEvent.click(await screen.findByRole("button", { name: "Start drilling" }));

    expect(await screen.findByText("Session complete")).toBeInTheDocument();
  });

  it("invites rather than apologises when nothing is due", async () => {
    server.use(
      http.get("/api/drill/queue", () =>
        HttpResponse.json({
          due: 0,
          fresh: 0,
          byOrigin: { "repertoire-deviation": 0, "engine-blunder": 0 },
        }),
      ),
    );

    await renderApp({ path: "/drill" });

    expect(await screen.findByText("Nothing due today")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start drilling" })).toBeNull();
  });

  it("asks a repertoire drill to be recalled, not solved", async () => {
    // The two origins ask different questions. You never "meant to" play
    // anything in a position the engine flagged — one instruction for
    // both told half the drills to remember a plan that never existed.
    await renderApp({ path: "/drill" });
    await userEvent.click(await screen.findByRole("button", { name: "Start drilling" }));

    expect(await screen.findByText("Play the move you prepared.")).toBeInTheDocument();
  });

  it("asks an engine drill to be improved on", async () => {
    server.use(
      http.get("/api/drill/next", () =>
        HttpResponse.json({
          ...drillItem,
          context: {
            origin: "engine-blunder",
            playedSan: null,
            label: "Move 17 vs magnuscarlsen",
          },
        }),
      ),
    );

    await renderApp({ path: "/drill" });
    await userEvent.click(await screen.findByRole("button", { name: "Start drilling" }));

    expect(
      await screen.findByText("Find a better move than the one you played."),
    ).toBeInTheDocument();
  });

  it("says whose move it is, which is the question and not a clue", async () => {
    await renderApp({ path: "/drill" });
    await userEvent.click(await screen.findByRole("button", { name: "Start drilling" }));

    expect(await screen.findByText("White to move")).toBeInTheDocument();
  });

  it("does not offer a hint", async () => {
    // In a repetition loop the second pass is the hint: a wrong answer
    // brings the position back. A lamp beside the board gives the same
    // help earlier, and takes the difficulty that makes the repetition
    // worth anything.
    await renderApp({ path: "/drill" });
    await userEvent.click(await screen.findByRole("button", { name: "Start drilling" }));

    expect(screen.queryByRole("button", { name: /Hint/ })).toBeNull();
    expect(screen.queryByText("Queen's pawn — chapter 3")).toBeNull();
  });

  it("counts how the sitting is going", async () => {
    // What a repetition loop shows in place of a hint: how much is left
    // and how much of it is coming back.
    await renderApp({ path: "/drill" });
    await userEvent.click(await screen.findByRole("button", { name: "Start drilling" }));

    expect(await screen.findByText("To go")).toBeInTheDocument();
    expect(screen.getByText("Wrong")).toBeInTheDocument();
    expect(screen.getByText("Right")).toBeInTheDocument();
  });

  it("invites rather than apologises when nothing is due", async () => {
    server.use(
      http.get("/api/drill/queue", () =>
        HttpResponse.json({
          due: 0,
          fresh: 0,
          byOrigin: { "repertoire-deviation": 0, "engine-blunder": 0 },
        }),
      ),
    );

    await renderApp({ path: "/drill" });

    expect(await screen.findByText("Nothing due today")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start drilling" })).toBeNull();
  });

  it("asks a repertoire drill to be recalled, not solved", async () => {
    // The two origins ask different questions. You never "meant to" play
    // anything in a position the engine flagged — one instruction for
    // both told half the drills to remember a plan that never existed.
    await renderApp({ path: "/drill" });
    await userEvent.click(await screen.findByRole("button", { name: "Start drilling" }));

    expect(await screen.findByText("Play the move you prepared.")).toBeInTheDocument();
  });

  it("asks an engine drill to be improved on", async () => {
    server.use(
      http.get("/api/drill/next", () =>
        HttpResponse.json({
          ...drillItem,
          context: {
            origin: "engine-blunder",
            playedSan: null,
            label: "Move 17 vs magnuscarlsen",
          },
        }),
      ),
    );

    await renderApp({ path: "/drill" });
    await userEvent.click(await screen.findByRole("button", { name: "Start drilling" }));

    expect(
      await screen.findByText("Find a better move than the one you played."),
    ).toBeInTheDocument();
  });

  it("says whose move it is, which is the question and not a clue", async () => {
    await renderApp({ path: "/drill" });
    await userEvent.click(await screen.findByRole("button", { name: "Start drilling" }));

    expect(await screen.findByText("White to move")).toBeInTheDocument();
  });

  it("brings the provenance with the answer, not before it", async () => {
    // Naming the chapter narrows the answer, so it arrives once the
    // answer does — which is also when it explains rather than helps.
    await renderApp({ path: "/drill" });
    await userEvent.click(await screen.findByRole("button", { name: "Start drilling" }));

    expect(screen.queryByText("Queen's pawn — chapter 3")).toBeNull();
  });
});

/**
 * What the answer says, reached by prop rather — reached by prop rather
 * than by dragging a piece: the assertion is about the words, not about
 * how the move got there.
 */
describe("drill answer", () => {
  const answered = { expectedSans: ["d4"], correct: false };

  it("does not ask how hard it was", () => {
    // `submitAnswer` grades on being right and on how long it took, and
    // schedules the card in the same call — by the time this renders the
    // interval is already decided. Four buttons here looked like a choice
    // and changed nothing.
    renderInApp(<DrillPrompt item={drillItem} answer={answered} />);

    for (const grade of ["Again", "Hard", "Good", "Easy"]) {
      expect(screen.queryByRole("button", { name: new RegExp(grade) })).toBeNull();
    }
  });

  it("contrasts the move you played with the one that counts", () => {
    renderInApp(<DrillPrompt item={drillItem} answer={answered} />);

    expect(screen.getByText("Nf3")).toBeInTheDocument();
    expect(screen.getByText("d4")).toBeInTheDocument();
  });

  it("credits your own decision when the drill came from your book", () => {
    // "Your preparation said d4" is a claim about a choice you made.
    renderInApp(<DrillPrompt item={drillItem} answer={answered} />);

    expect(screen.getByText(/Your preparation said/)).toBeInTheDocument();
    expect(screen.queryByText(/The engine preferred/)).toBeNull();
  });

  it("credits the engine when the drill came from a blunder", () => {
    // Saying "your preparation said d4" here invents a plan the person
    // never had — nothing in their book mentions this position.
    const fromEngine = {
      ...drillItem,
      context: {
        origin: "engine-blunder" as const,
        playedSan: null,
        label: "Move 17 vs magnuscarlsen",
      },
    };

    renderInApp(<DrillPrompt item={fromEngine} answer={answered} />);

    expect(screen.getByText(/The engine preferred/)).toBeInTheDocument();
    expect(screen.queryByText(/Your preparation said/)).toBeNull();
  });

  it("stays neutral when there is no provenance to claim", () => {
    const orphan = { ...drillItem, context: null };

    renderInApp(<DrillPrompt item={orphan} answer={answered} />);

    expect(screen.getByText(/The move here is/)).toBeInTheDocument();
  });
});
