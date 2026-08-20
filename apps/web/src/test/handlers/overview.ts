import { http, HttpResponse } from "msw";

export const overview = {
  data: { games: 14, deviations: 3, exercises: 2, dueCards: 1 },
  empty: { games: 0, deviations: 0, exercises: 0, dueCards: 0 },
  /** Games in, nothing derived from them yet — the only state where a zero
   * on this screen is the backend's answer rather than a blank. */
  imported: { games: 14, deviations: 0, exercises: 0, dueCards: 0 },
} as const;

export const overviewHandlers = [
  http.get("/api/overview", () => HttpResponse.json(overview.data)),
];
