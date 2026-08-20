import { describe, expect, it } from "vitest";

import { effectiveStatus, makeScheduler, type CardState } from "@velachess/scheduler";

const T0 = new Date("2026-08-14T12:00:00Z");

function minutesLater(minutes: number): Date {
  return new Date(T0.getTime() + minutes * 60_000);
}

function daysLater(days: number): Date {
  return new Date(T0.getTime() + days * 86_400_000);
}

describe("vocabulary flashcard (the domain-boundary acceptance test)", () => {
  it("schedules 'Haus' → 'casa' through its whole life without any chess in sight", () => {
    const scheduler = makeScheduler();
    const flashcard = { front: "Haus", back: "casa", card: scheduler.newCard(T0) };

    expect(flashcard.card.phase).toBe("new");
    expect(flashcard.card.reps).toBe(0);

    // First correct answer: the card starts learning.
    flashcard.card = scheduler.review(flashcard.card, "good", T0);
    expect(flashcard.card.phase).toBe("learning");
    expect(flashcard.card.reps).toBe(1);
    expect(flashcard.card.due.getTime()).toBeGreaterThan(T0.getTime());

    // Keep answering well: graduates to review with a due date days away.
    flashcard.card = scheduler.review(flashcard.card, "good", minutesLater(10));
    expect(flashcard.card.phase).toBe("review");
    expect(flashcard.card.due.getTime()).toBeGreaterThan(daysLater(1).getTime());

    // Forgetting knocks it into relearning and counts the lapse.
    const beforeLapse = flashcard.card;
    flashcard.card = scheduler.review(flashcard.card, "again", daysLater(3));
    expect(flashcard.card.phase).toBe("relearning");
    expect(flashcard.card.lapses).toBe(beforeLapse.lapses + 1);
  });

  it("due dates only move forward through a review sequence", () => {
    const scheduler = makeScheduler();
    let card = scheduler.newCard(T0);
    let lastDue = T0.getTime();
    let now = T0;

    for (const grade of ["good", "good", "good", "hard", "good"] as const) {
      card = scheduler.review(card, grade, now);
      expect(card.due.getTime()).toBeGreaterThan(now.getTime());
      now = card.due;
      expect(card.due.getTime()).toBeGreaterThanOrEqual(lastDue);
      lastDue = card.due.getTime();
    }
  });
});

describe("previewIntervals", () => {
  it("returns all four outcomes, ordered easy ≥ good ≥ hard, without mutating the input", () => {
    const scheduler = makeScheduler();
    let card = scheduler.newCard(T0);
    card = scheduler.review(card, "good", T0);
    card = scheduler.review(card, "good", minutesLater(10));
    const snapshot = { ...card };

    const preview = scheduler.previewIntervals(card, daysLater(2));

    expect(preview.easy.intervalDays).toBeGreaterThanOrEqual(preview.good.intervalDays);
    expect(preview.good.intervalDays).toBeGreaterThanOrEqual(preview.hard.intervalDays);
    expect(preview.hard.intervalDays).toBeGreaterThan(preview.again.intervalDays);
    expect(card).toEqual(snapshot);
  });
});

describe("effectiveStatus", () => {
  it("derives 'due' from the clock instead of storing it", () => {
    const scheduler = makeScheduler();
    let card = scheduler.newCard(T0);
    expect(effectiveStatus(card, T0)).toBe("new");

    card = scheduler.review(card, "good", T0);
    card = scheduler.review(card, "good", minutesLater(10));
    expect(card.phase).toBe("review");

    expect(effectiveStatus(card, minutesLater(11))).toBe("review");
    expect(effectiveStatus(card, new Date(card.due.getTime() + 1))).toBe("due");
  });
});
describe("persistence round-trip", () => {
  it("a card rebuilt from plain persisted fields schedules identically to the original", () => {
    const scheduler = makeScheduler();
    let card = scheduler.newCard(T0);
    card = scheduler.review(card, "good", T0);
    card = scheduler.review(card, "good", minutesLater(10));

    const persisted = JSON.parse(JSON.stringify(card)) as Record<string, unknown>;
    const rebuilt: CardState = {
      ...(persisted as unknown as CardState),
      due: new Date(persisted["due"] as string),
      lastReview: persisted["lastReview"]
        ? new Date(persisted["lastReview"] as string)
        : null,
    };

    const a = scheduler.review(card, "good", daysLater(2));
    const b = scheduler.review(rebuilt, "good", daysLater(2));
    expect(b).toEqual(a);
  });
});
