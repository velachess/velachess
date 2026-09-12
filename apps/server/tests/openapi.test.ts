// @vitest-environment node
/**
 * Anti-drift: every route Hono has registered must exist in the served
 * OpenAPI document, and every documented path+method must be a real route.
 * Add a route without an `.openapi()` declaration (or vice versa) and this
 * fails. Unlike the old hand-written `openapi.ts`, the document itself is
 * generated from each route's `createRoute` — this test can no longer fail
 * because someone forgot to update a second file, only because a route is
 * missing a `createRoute`/`.openapi()` declaration entirely.
 */
import { afterAll, beforeAll, expect, it } from "vitest";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;
let owner: AuthedApp;
let spec: OpenApiDocument;

interface OpenApiDocument {
  openapi: string;
  info: { title: string };
  paths: Record<string, Record<string, unknown>>;
}

beforeAll(async () => {
  harness = await createApiHarness();
  owner = (await harness.signUp("owner@openapi.test")).app;
  const res = await harness.app.request("/openapi.json");
  spec = (await res.json()) as OpenApiDocument;
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
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const method of Object.keys(methods)) {
      operations.add(`${method.toUpperCase()} ${path}`);
    }
  }
  return operations;
}

it("every registered route is documented, every documented route exists", () => {
  const registered = registeredOperations();
  const documented = documentedOperations();

  // `doc31()` serves the document and doesn't declare itself in it — an
  // OpenAPI spec routinely omits its own serving endpoint. `/docs` is the
  // Swagger UI page reading that spec, not an API operation of its own.
  registered.delete("GET /openapi.json");
  registered.delete("GET /docs");

  const undocumented = [...registered].filter((op) => !documented.has(op));
  const phantom = [...documented].filter((op) => !registered.has(op));

  expect(undocumented, "routes missing a createRoute/.openapi() declaration").toEqual([]);
  expect(phantom, "documented routes that do not exist").toEqual([]);
});

it("GET /openapi.json serves the document", async () => {
  const res = await harness.app.request("/openapi.json");
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/json");
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.info.title).toBe("VelaChess API");
  expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(13);
});

it("a representative route's request and response schemas come from its own Zod schemas, not a hand-written duplicate", () => {
  // POST /accounts — request body schema, generated from `createAccountSchema`.
  const post = spec.paths["/accounts"]?.["post"] as {
    requestBody: { content: { "application/json": { schema: JsonSchema } } };
    responses: { "201": { content: { "application/json": { schema: JsonSchema } } } };
  };
  const body = post.requestBody.content["application/json"].schema;
  expect(body.properties?.["platform"]?.enum).toEqual(
    expect.arrayContaining(["chess_com", "lichess"]),
  );
  expect(body.properties?.["username"]?.type).toBe("string");
  expect(body.required).toEqual(expect.arrayContaining(["platform", "username"]));

  // Response schema, generated from `accountSchema`.
  const response = post.responses["201"].content["application/json"].schema;
  expect(Object.keys(response.properties ?? {}).toSorted()).toEqual([
    "id",
    "platform",
    "username",
  ]);
});

interface JsonSchema {
  type?: string | string[];
  nullable?: boolean;
  enum?: unknown[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
}

/** A field "accepts null" under OpenAPI 3.1 / JSON Schema semantics when
 * its `type` is (or includes) `"null"`, or one of its `anyOf`/`oneOf`
 * branches is the bare `{ type: "null" }` schema — never via the
 * OpenAPI-3.0-only `nullable: true` keyword. */
function acceptsNull(schema: JsonSchema): boolean {
  if (schema.nullable === true) return false; // the very keyword this issue removes
  if (Array.isArray(schema.type) && (schema.type as string[]).includes("null"))
    return true;
  if (schema.type === "null") return true;
  const branches = schema.anyOf ?? schema.oneOf ?? [];
  return branches.some((branch) => branch.type === "null");
}

it("nullable fields use OpenAPI 3.1 / JSON Schema semantics, not OpenAPI 3.0's `nullable: true`", () => {
  expect(JSON.stringify(spec)).not.toContain('"nullable":true');

  // The issue's own drift example: chapterName is nullable in the real
  // type (`libs/deviations/list-deviations`) but was a required, non-null
  // string in the old hand-written doc.
  const deviationsGet = spec.paths["/deviations"]?.["get"] as {
    responses: { "200": { content: { "application/json": { schema: JsonSchema } } } };
  };
  const items = deviationsGet.responses["200"].content["application/json"].schema.items;
  const chapterName = items?.properties?.["chapterName"];
  expect(chapterName).toBeDefined();
  expect(acceptsNull(chapterName!)).toBe(true);
});

it("system routes are registered before the identity middleware", () => {
  // Liveness and documentation must answer even when the db is down —
  // their registration order IS the guarantee (middleware applies only
  // to routes registered after it). The gate is found by handler name
  // rather than by "the first ALL /*", because the edge middleware
  // (headers, body limit, CSRF) is deliberately registered above these
  // routes and would otherwise be mistaken for it.
  const order = harness.app.routes.map((r) => `${r.method} ${r.path} ${r.handler.name}`);
  const at = (needle: string) => order.findIndex((entry) => entry.includes(needle));

  const gate = at("ALL /* sessionGate");
  expect(gate).toBeGreaterThan(-1);
  expect(gate).toBeGreaterThan(at("GET /health"));
  expect(gate).toBeGreaterThan(at("GET /openapi.json"));
  // Signing in happens without a session, definitionally.
  expect(gate).toBeGreaterThan(at("ALL /auth/*"));

  // And the limiter sits below the gate, because every policy is keyed by
  // the userId the gate resolves — above it there would be nothing to key.
  expect(at("rateLimited")).toBeGreaterThan(gate);

  // Unlike the checks above, this catches a route the list doesn't
  // already know about — a new endpoint added above the gate, answering
  // unauthenticated by accident.
  const above = new Set(
    harness.app.routes.slice(0, gate).map((r) => `${r.method} ${r.path}`),
  );
  expect(above).toEqual(
    new Set([
      "ALL /*",
      "GET /health",
      "GET /config",
      "GET /openapi.json",
      "GET /docs",
      "ALL /auth/*",
    ]),
  );
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
