import { describe, expect, it } from "vitest";

import type { AdherenceMetrics } from "@velachess/repertoires";

import { adherenceFinding } from "../adherence-finding.ts";
import type { FindingSubject, OutcomeBucket } from "../adherence-finding.ts";

const subject: FindingSubject = {
  repertoireId: "11111111-1111-1111-1111-111111111111",
  name: "White e4",
  color: "white",
};

/** A bucket built from outcomes, so a test says "12 wins, 8 losses"
 * rather than restating the win rate it is supposed to be checking. */
function bucket(wins: number, draws: number, losses: number): OutcomeBucket {
  const decided = wins + draws + losses;
  return {
    total: decided,
    wins,
    draws,
    losses,
    winRate: decided === 0 ? 0 : wins / decided,
  };
}

function metrics(
  inBook: OutcomeBucket,
  outOfBook: OutcomeBucket,
  overrides: Partial<AdherenceMetrics> = {},
): AdherenceMetrics {
  const judgedGames = inBook.total + outOfBook.total;
  return {
    judgedGames,
    skippedGames: 0,
    faithfulGames: inBook.total,
    adherenceRate: judgedGames === 0 ? 0 : inBook.total / judgedGames,
    averagePrepDepth: 9,
    inBook,
    outOfBook,
    ...overrides,
  };
}

describe("adherenceFinding", () => {
  it("reports an advantage when the book outscores leaving it", () => {
    // 70% inside, 30% outside — a gap no sample this size invents.
    const finding = adherenceFinding(subject, metrics(bucket(7, 0, 3), bucket(3, 0, 7)));

    expect(finding?.kind).toBe("book-advantage");
    expect(finding?.weight).toBeCloseTo(0.4);
  });

  it("reports a disadvantage rather than congratulating the book", () => {
    // The case the screen exists for: preparation that is a bad fit.
    // A rule that could only find advantages would hide it.
    const finding = adherenceFinding(subject, metrics(bucket(2, 0, 8), bucket(8, 0, 2)));

    expect(finding?.kind).toBe("book-disadvantage");
    expect(finding?.weight).toBeCloseTo(0.6);
  });

  it("says nothing when either side is too thin to compare", () => {
    // Four decided games out of book: a 100%-vs-0% gap that means nothing.
    expect(
      adherenceFinding(subject, metrics(bucket(9, 0, 1), bucket(0, 0, 4))),
    ).toBeNull();

    expect(
      adherenceFinding(subject, metrics(bucket(4, 0, 0), bucket(2, 0, 8))),
    ).toBeNull();
  });

  it("counts decided games, not games played", () => {
    // Twenty games in the bucket, two with an outcome. The rate is over
    // two, and `total` would have let it through.
    const thin: OutcomeBucket = { total: 20, wins: 2, draws: 0, losses: 0, winRate: 1 };

    expect(adherenceFinding(subject, metrics(thin, bucket(2, 0, 8)))).toBeNull();
  });

  it("says nothing when the two rates are the same number", () => {
    // 55% against 50%. Real, and not worth a card.
    expect(
      adherenceFinding(subject, metrics(bucket(11, 0, 9), bucket(10, 0, 10))),
    ).toBeNull();
  });

  it("carries the numbers the card reads, from one source", () => {
    const finding = adherenceFinding(
      subject,
      metrics(bucket(7, 0, 3), bucket(3, 0, 7), {
        averagePrepDepth: 11,
        skippedGames: 4,
      }),
    );

    expect(finding?.evidence).toEqual({
      inBookGames: 10,
      inBookWinRate: 0.7,
      outOfBookGames: 10,
      outOfBookWinRate: 0.3,
      judgedGames: 20,
      adherenceRate: 0.5,
      averagePrepDepth: 11,
    });
    expect(finding?.subject).toEqual(subject);
    expect(finding?.id).toBe(subject.repertoireId);
  });
});
