// @vitest-environment node
/** Every outbound request is counted, so "asks no provider" is asserted by
 * what stops being asked rather than by reading the implementation. */
import { parseResponse } from "hono/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LOOPER_USERNAME } from "@velachess/fixtures";
import { chessComFixtureFetch } from "@velachess/test-utils";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;
let owner: AuthedApp;
let requests: string[];

beforeAll(async () => {
  const base = chessComFixtureFetch();
  requests = [];
  const countingFetch: typeof globalThis.fetch = async (input, init) => {
    requests.push(String(input));
    return base(input, init);
  };

  harness = await createApiHarness({ fetch: countingFetch });
  owner = (await harness.signUp("game-reads@api.test")).app;

  const account = await parseResponse(
    owner.api.accounts.$post({
      json: { platform: "chess_com", username: LOOPER_USERNAME },
    }),
  );
  if (!account.syncId) throw new Error("expected a first sync on a fresh connect");
  await harness.runSync(account.syncId);
});

afterAll(async () => {
  await harness.close();
});

describe("reading games", () => {
  it("lists a page without a player identity on any row", async () => {
    const before = requests.length;
    const page = await parseResponse(owner.api.games.$get({ query: {} }));
    const row = page.games[0];

    expect(row).toBeDefined();
    expect(Object.keys(row!).toSorted()).toEqual(
      [
        "blackName",
        "blackRating",
        "externalUrl",
        "id",
        "openingName",
        "perspective",
        "playedAt",
        "result",
        "source",
        "timeControlIncrementSeconds",
        "timeControlInitialSeconds",
        "whiteName",
        "whiteRating",
      ].toSorted(),
    );
    expect(requests.slice(before)).toEqual([]);
  });

  it("opens one game without a player identity on either seat", async () => {
    const page = await parseResponse(owner.api.games.$get({ query: {} }));
    const before = requests.length;

    const game = await parseResponse(
      owner.api.games[":id"].$get({ param: { id: page.games[0]!.id } }),
    );

    expect(game.rawPgn).toContain("1.");
    expect(Object.keys(game)).not.toContain("whiteIdentity");
    expect(Object.keys(game)).not.toContain("blackIdentity");
    expect(requests.slice(before)).toEqual([]);
  });
});
