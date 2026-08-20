// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DetailedError } from "../../../shared/api/client.ts";
import { useMyAccounts, type RememberedAccount } from "../my-accounts.ts";
import { importArchive, importStatus } from "../queries.ts";
import { INPUT_KINDS, SOURCE_IDS } from "../sources.ts";

const remembered = (overrides: Partial<RememberedAccount> = {}): RememberedAccount => ({
  accountId: "a1",
  platform: "chess_com",
  username: "yurimutti",
  ...overrides,
});

describe("where someone belongs", () => {
  it("is empty until this device imports something", () => {
    expect(importStatus([])).toBe("empty");
  });

  it("is ready once it has", () => {
    // Importing is a synchronous read: an account is remembered only after
    // a response that already carried games. There is no delivery state
    // left to verify, so the device alone decides.
    expect(importStatus([remembered()])).toBe("ready");
  });
});

describe("what the device remembers", () => {
  beforeEach(() => {
    useMyAccounts.setState({ accounts: [] });
  });

  it("answers from the device alone", () => {
    // Which chess account is selected is a browser fact — no request, and
    // no bearing on who the person is. Identity moved to the server
    // session; this only chooses what the games screen shows.
    const fetchSpy = vi.fn(() => {
      throw new Error("selecting an account must not reach the network");
    });
    vi.stubGlobal("fetch", fetchSpy);

    expect(importStatus(useMyAccounts.getState().accounts)).toBe("empty");
    useMyAccounts.setState({ accounts: [remembered()] });
    expect(importStatus(useMyAccounts.getState().accounts)).toBe("ready");
    expect(fetchSpy).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

const request = (username: string) => ({
  kind: INPUT_KINDS.username,
  source: SOURCE_IDS.chessCom,
  username,
});

const archiveResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("importing", () => {
  beforeEach(() => {
    useMyAccounts.setState({ accounts: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const account = {
    id: "acc-1",
    platform: "chess_com",
    username: "yurimutti",
    lastSyncedAt: "2026-08-16T12:00:00Z",
  };

  it("posts the handle to the endpoint that creates connections", async () => {
    // Not `GET /games`: a read that created the account is exactly the
    // write-on-read the server removed, and asking it to import now
    // answers 404 for anyone importing for the first time.
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      archiveResponse(account, 201),
    );
    vi.stubGlobal("fetch", fetchSpy);

    await importArchive(request("YuriMutti"));

    const [input, init] = fetchSpy.mock.calls[0]!;
    const url = String(input instanceof Request ? input.url : input);
    expect(url).toContain("/api/accounts");
    expect((init as RequestInit | undefined)?.method ?? "GET").toBe("POST");
    expect(String((init as RequestInit | undefined)?.body)).toContain("YuriMutti");
  });

  it("remembers the server's username, not the one that was typed", async () => {
    // Platforms normalise, and the account this device owns has to match
    // what the API will keep answering with.
    vi.stubGlobal("fetch", async () => archiveResponse(account, 201));

    const result = await importArchive(request("YuriMutti"));

    expect(result).toEqual({
      accountId: "acc-1",
      platform: "chess_com",
      username: "yurimutti",
    });
    expect(useMyAccounts.getState().accounts).toEqual([result]);
  });

  it("takes ownership, so the games screen has an account right after", async () => {
    vi.stubGlobal("fetch", async () => archiveResponse(account, 201));

    expect(importStatus(useMyAccounts.getState().accounts)).toBe("empty");
    await importArchive(request("yurimutti"));
    expect(importStatus(useMyAccounts.getState().accounts)).toBe("ready");
  });

  it("throws and owns nothing when the platform has no such archive", async () => {
    // A typo answers 404 here and now — there is no background job left to
    // give up quietly hours later.
    vi.stubGlobal("fetch", async () =>
      archiveResponse({ error: "archive not found" }, 404),
    );

    try {
      await importArchive(request("nobodyhere"));
      throw new Error("expected import to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(DetailedError);
      expect(error).toMatchObject({ statusCode: 404 });
    }
    expect(useMyAccounts.getState().accounts).toEqual([]);
    expect(importStatus(useMyAccounts.getState().accounts)).toBe("empty");
  });

  it("importing the same account twice leaves one entry", async () => {
    vi.stubGlobal("fetch", async () => archiveResponse(account, 201));

    await importArchive(request("yurimutti"));
    await importArchive(request("YURIMUTTI"));

    expect(useMyAccounts.getState().accounts).toHaveLength(1);
  });

  it("a second platform is a second account, not a replacement", async () => {
    vi.stubGlobal("fetch", async () => archiveResponse(account, 201));
    await importArchive(request("yurimutti"));

    const lichess = { ...account, id: "acc-2", platform: "lichess", username: "yuri" };
    vi.stubGlobal("fetch", async () => archiveResponse(lichess, 201));
    await importArchive({ ...request("Yuri"), source: SOURCE_IDS.lichess });

    expect(useMyAccounts.getState().accounts.map((a) => a.platform)).toEqual([
      "chess_com",
      "lichess",
    ]);
  });
});
