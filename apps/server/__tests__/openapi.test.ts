// @vitest-environment node
/**
 * Anti-drift: every route Hono has registered must exist in the served
 * OpenAPI document, and every documented path+method must be a real route.
 * Add a route without documenting it (or vice versa) and this fails.
 */
import { afterAll, beforeAll, expect, it } from "vitest";

import { openApiSpec } from "../src/openapi.ts";
import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;
let owner: AuthedApp;

beforeAll(async () => {
  harness = await createApiHarness();
  owner = (await harness.signUp("owner@openapi.test")).app;
});

afterAll(async () => {
  await harness.close();
});

function registeredOperations(): Set<string> {
  const operations = new Set<string>();
  for (const route of harness.app.routes) {
    if (route.method === "ALL") continue; // middleware, not an endpoint
    const path = route.path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
    operations.add(`${route.method} ${path}`);
  }
  return operations;
}

function documentedOperations(): Set<string> {
  const operations = new Set<string>();
  for (const [path, methods] of Object.entries(openApiSpec.paths)) {
    for (const method of Object.keys(methods)) {
      operations.add(`${method.toUpperCase()} ${path}`);
    }
  }
  return operations;
}

it("every registered route is documented, every documented route exists", () => {
  const registered = registeredOperations();
  const documented = documentedOperations();

  const undocumented = [...registered].filter((op) => !documented.has(op));
  const phantom = [...documented].filter((op) => !registered.has(op));

  expect(undocumented, "routes missing from openapi.ts").toEqual([]);
  expect(phantom, "documented routes that do not exist").toEqual([]);
});

it("GET /openapi.json serves the document", async () => {
  const res = await harness.app.request("/openapi.json");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/json");
  const spec = (await res.json()) as typeof openApiSpec;
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.info.title).toBe("VelaChess API");
  expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(13);
});

it("system routes are registered before the identity middleware", () => {
  // Liveness and documentation must answer even when the db is down —
  // their registration order IS the guarantee (middleware applies only
  // to routes registered after it).
  const order = harness.app.routes.map((r) => `${r.method} ${r.path}`);
  const middleware = order.indexOf("ALL /*");
  expect(middleware).toBeGreaterThan(order.indexOf("GET /health"));
  expect(middleware).toBeGreaterThan(order.indexOf("GET /openapi.json"));
});

it("error responses honor the documented { error } contract", async () => {
  // invalid body → 400 with { error }, not zod's default dump
  const badBody = await owner.request("/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platform: "nope" }),
  });
  expect(badBody.status).toBe(400);
  const bodyError = (await badBody.json()) as { error: string; details: string[] };
  expect(typeof bodyError.error).toBe("string");
  expect(bodyError.details.length).toBeGreaterThan(0);

  // malformed path id → 400, never a db error
  const badParam = await owner.request("/games/not-a-uuid/analysis");
  expect(badParam.status).toBe(400);
  expect(((await badParam.json()) as { error: string }).error).toBe("invalid id");

  // unknown route → JSON 404, same shape (with a session; without one,
  // the gate answers first and unknown paths 401 like everything else)
  const missing = await owner.request("/nope");
  expect(missing.status).toBe(404);
  expect(((await missing.json()) as { error: string }).error).toBe("not found");
});
