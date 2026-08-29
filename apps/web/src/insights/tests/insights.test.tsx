import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";

import { deviceHasImported } from "../../test/device.ts";
import {
  heterogeneousFindings,
  insightFindings,
  insightsReport,
} from "../../test/handlers/insights.ts";
import { renderApp } from "../../test/render.tsx";
import { server } from "../../test/server.ts";

/**
 * The insights screen, through a route and over HTTP.
 *
 * Everything asserted here is a sentence a person reads, because what
 * this screen can get wrong is what it says: congratulating a book that
 * is costing games, announcing a percentage of nothing, or offering an
 * action that argues against its own evidence.
 */
describe("insights", () => {
  beforeEach(() => {
    deviceHasImported();
  });

  it("names what was found, not the numbers behind it", async () => {
    await renderApp({ path: "/insights" });

    expect(
      await screen.findByText("Your preparation is paying off with White"),
    ).toBeInTheDocument();
  });

  it("says a book is costing you rather than only ever congratulating", async () => {
    // The direction is measured, not assumed. A screen that could only
    // report an advantage would hide the case most worth acting on.
    await renderApp({ path: "/insights" });

    expect(
      await screen.findByText("You score better when you leave your Black book"),
    ).toBeInTheDocument();
  });

  it("shows both sides of the comparison the finding was drawn from", async () => {
    // One rate says nothing; the card exists for the gap between two.
    await renderApp({ path: "/insights" });

    expect(await screen.findByText("70% of 34 games")).toBeInTheDocument();
    expect(screen.getByText("41% of 18 games")).toBeInTheDocument();
  });

  it("reads the same sentence aloud that it shows", async () => {
    // A progressbar announces a bare "70%" unless told otherwise, and the
    // count is half of what makes the number worth trusting. The visible
    // value is aria-hidden by the primitive precisely so this replaces it,
    // which is why the two must not drift.
    //
    // Queried by role and read in order rather than by accessible name:
    // the name comes from the label through `aria-labelledby`, and there
    // are two "Followed the book" bars on this screen anyway.
    await renderApp({ path: "/insights" });
    await screen.findByText("70% of 34 games");

    const bars = screen.getAllByRole("progressbar");
    expect(bars.map((bar) => bar.getAttribute("aria-valuetext"))).toEqual([
      "won 70% of 34 games",
      "won 41% of 18 games",
      "won 33% of 12 games",
      "won 51% of 9 games",
    ]);
  });

  it("says how faithful you were and how deep the book runs", async () => {
    // 9.4 plies is four and a half moves, which reads as five — not the
    // ceil that maps a single ply to its move number.
    await renderApp({ path: "/insights" });

    expect(
      await screen.findByText(
        "You followed it in 65% of 52 judged games, and it runs about 5 moves deep.",
      ),
    ).toBeInTheDocument();
  });

  it("offers drilling when the book works, and a look at the games when it does not", async () => {
    // The action follows the evidence. Telling someone to practise a book
    // they score worse inside would be advice against its own card.
    await renderApp({ path: "/insights" });

    expect(
      await screen.findByRole("link", { name: "Train the moves you missed" }),
    ).toHaveAttribute("href", "/drill");
    // Narrowed to the colour the finding is about, so the link lands on
    // the games it was drawn from rather than the whole archive.
    expect(screen.getByRole("link", { name: "Look at these games" })).toHaveAttribute(
      "href",
      "/games?color=black",
    );
  });

  it("keeps the order the server ranked them in", async () => {
    // Ranking is a decision made where it can be tested. A screen that
    // re-sorted would be a second opinion nobody can see.
    await renderApp({ path: "/insights" });
    await screen.findByText("White repertoire");

    const headings = screen.getAllByText(/paying off|score better/);
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Your preparation is paying off with White",
      "You score better when you leave your Black book",
    ]);
  });

  it("says there is nothing to say instead of showing an empty page", async () => {
    // Silence is the designed answer below the evidence floor, so the
    // screen has to explain it rather than look broken.
    server.use(http.get("/api/insights", () => HttpResponse.json(insightsReport([]))));

    await renderApp({ path: "/insights" });

    expect(await screen.findByText("Nothing worth saying yet")).toBeInTheDocument();
    // Silence still says what it was drawn from — the envelope's
    // coverage is what separates "import" advice from "analyse" advice.
    expect(
      screen.getByText("Right now: 64 games imported, 21 deeply analysed."),
    ).toBeInTheDocument();
    expect(screen.queryByText(insightFindings[0]!.subject.name)).not.toBeInTheDocument();
  });

  it("shows a contextual message when insights cannot be read", async () => {
    server.use(http.get("/api/insights", () => new HttpResponse(null, { status: 500 })));

    await renderApp({ path: "/insights" });

    expect(await screen.findByText("Insights")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load insights.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.queryByText("Nothing worth saying yet")).not.toBeInTheDocument();
  });

  it("keeps the screen stable and lets the shell report a backend outage", async () => {
    server.use(http.get("/api/insights", () => new HttpResponse(null, { status: 503 })));

    await renderApp({ path: "/insights" });

    expect(
      await screen.findByText("Backend unavailable · Retrying automatically"),
    ).toBeInTheDocument();
    expect(screen.getByText("Couldn't load insights.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(
      screen.queryByText("Can't reach the API. Start the stack and this will fill in."),
    ).not.toBeInTheDocument();
  });
});

describe("the finding-centric page", () => {
  beforeEach(() => {
    deviceHasImported();
    server.use(
      http.get("/api/insights", () =>
        HttpResponse.json(insightsReport(heterogeneousFindings)),
      ),
    );
  });

  it("opens with the top-ranked finding at full voice", async () => {
    await renderApp({ path: "/insights" });

    const hero = (
      await screen.findByText("Your preparation is paying off with White")
    ).closest("[data-emphasis]");
    expect(hero).toHaveAttribute("data-emphasis", "hero");

    // Everything else reads as a list entry — priority is hierarchy,
    // not a badge.
    const trend = screen
      .getByText("Your last 20 games are a clear step up")
      .closest("[data-emphasis]");
    expect(trend).toHaveAttribute("data-emphasis", "standard");
  });

  it("groups what is not critical into its section, in rank order", async () => {
    await renderApp({ path: "/insights" });
    await screen.findByText("Start here");

    // The three top-ranked findings live under "Start here"; the rest
    // fall into their sections. Section headers exist only because they
    // have content — see the sparse test below.
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual([
      "Start here",
      "Game phases",
      "Openings",
      "Training",
    ]);
  });

  it("renders heterogeneous kinds through one block shape", async () => {
    await renderApp({ path: "/insights" });

    expect(
      await screen.findByText("Sicilian Defense is costing you points"),
    ).toBeInTheDocument();
    expect(screen.getByText("Winning positions are slipping away")).toBeInTheDocument();
    expect(
      screen.getByText("Blunders keep landing in your middlegame"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Your middlegame is where the mistakes concentrate"),
    ).toBeInTheDocument();
  });

  it("states the trend as a conclusion with the comparison under it", async () => {
    await renderApp({ path: "/insights" });

    expect(
      await screen.findByText("Your last 20 games are a clear step up"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("You scored 67% against 42% in the 20 before them."),
    ).toBeInTheDocument();
    // The four metric rows, previous → latest, no chart required.
    expect(screen.getByText("Mistakes per game")).toBeInTheDocument();
    expect(screen.getByText("Blunders per game")).toBeInTheDocument();
  });

  it("keeps evidence behind disclosure, not on the surface", async () => {
    const { user } = await renderApp({ path: "/insights" });
    await screen.findByText("Winning positions are slipping away");

    // The worst throw's game is reachable, but only after asking.
    expect(screen.queryByRole("link", { name: "Open the worst one" })).not.toBeVisible();
    await user.click(screen.getAllByText("Open the worst one")[0]!);
    expect(screen.getByRole("link", { name: "Open the worst one" })).toHaveAttribute(
      "href",
      "/games/game-1",
    );
  });

  it("gives every actionable finding a real destination", async () => {
    await renderApp({ path: "/insights" });
    await screen.findByText("Start here");

    const trainLinks = screen.getAllByRole("link", { name: "Train this" });
    expect(trainLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of trainLinks) expect(link).toHaveAttribute("href", "/drill");
    // Two "View games": the trend's and the opening's — both real routes.
    for (const link of screen.getAllByRole("link", { name: "View games" })) {
      expect(link).toHaveAttribute("href", "/games");
    }
  });

  it("shows no section header when everything fit in critical", async () => {
    // The default two-finding fixture: both are critical, no tail — a
    // "Start here" over the whole page would label everything and say
    // nothing, and empty sections are exactly the filler this screen
    // refuses to render.
    server.use(
      http.get("/api/insights", () => HttpResponse.json(insightsReport(insightFindings))),
    );

    await renderApp({ path: "/insights" });
    await screen.findByText("Your preparation is paying off with White");

    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("skips a kind it cannot draw instead of crashing on it", async () => {
    server.use(
      http.get("/api/insights", () =>
        HttpResponse.json(
          insightsReport([
            {
              id: "x",
              kind: "time-trouble",
              section: "performance",
              evidence: {},
              weight: 0.9,
            },
            ...insightFindings,
          ]),
        ),
      ),
    );

    await renderApp({ path: "/insights" });

    expect(
      await screen.findByText("Your preparation is paying off with White"),
    ).toBeInTheDocument();
  });
});
