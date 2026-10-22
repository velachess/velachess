// @vitest-environment node
import type { Server } from "node:http";

import { expect, it } from "vitest";

import { serveLiveness } from "../src/liveness.ts";

function portOf(server: Server): number {
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("not listening");
  return address.port;
}

async function withLiveness(run: (origin: string) => Promise<void>) {
  const server = await serveLiveness(0);
  try {
    await run(`http://127.0.0.1:${portOf(server)}`);
  } finally {
    server.close();
  }
}

it("answers GET /health/live while the process is up", async () => {
  await withLiveness(async (origin) => {
    const response = await fetch(`${origin}/health/live`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});

it("answers nothing else", async () => {
  await withLiveness(async (origin) => {
    expect((await fetch(`${origin}/`)).status).toBe(404);
    expect((await fetch(`${origin}/health/live`, { method: "POST" })).status).toBe(404);
  });
});

it("refuses to start on a port already taken", async () => {
  const taken = await serveLiveness(0);
  try {
    await expect(serveLiveness(portOf(taken))).rejects.toMatchObject({
      code: "EADDRINUSE",
    });
  } finally {
    taken.close();
  }
});
