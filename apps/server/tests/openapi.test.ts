// @vitest-environment node
import { afterAll, beforeAll, expect, it } from "vitest";

import { createApiHarness, type ApiHarness, type AuthedApp } from "./harness.ts";

let harness: ApiHarness;
let owner: AuthedApp;
let spec: OpenApiDocument;

interface JsonContent {
  content: Record<string, { schema: JsonSchema }>;
}

interface OpenApiDocument {
  openapi: string;
  info: { title: string };
  paths: Record<
    string,
    Record<string, { requestBody?: JsonContent; responses: Record<string, JsonContent> }>
  >;
}

function requestSchema(path: string, method: string): JsonSchema {
  const schema =
    spec.paths[path]?.[method]?.requestBody?.content["application/json"]?.schema;
  if (!schema) throw new Error(`no JSON request body documented for ${method} ${path}`);
  return schema;
}

function responseSchema(path: string, method: string, status: string): JsonSchema {
  const schema =
    spec.paths[path]?.[method]?.responses[status]?.content["application/json"]?.schema;
  if (!schema) throw new Error(`no JSON ${status} documented for ${method} ${path}`);
  return schema;
}

beforeAll(async () => {
  harness = await createApiHarness();
  owner = (await harness.signUp("owner@openapi.test")).app;
  const res = await harness.app.request("/openapi.json");
  spec = await res.json();
});

afterAll(async () => {
  await harness.close();
});

function registeredOperations(): Set<string> {
  const operations = new Set<string>();
  for (const route of harness.app.routes) {
    if (route.method === "ALL") continue;
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

  // `doc31()` does not declare its own serving endpoint, and `/docs` is the
  // Swagger UI page reading the spec rather than an API operation.
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
  expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(12);
});

it("a representative route's request and response schemas come from its own Zod schemas, not a hand-written duplicate", () => {
  const body = requestSchema("/accounts", "post");
  expect(body.properties?.["platform"]?.enum).toEqual(
    expect.arrayContaining(["chess_com", "lichess"]),
  );
  expect(body.properties?.["username"]?.type).toBe("string");
  expect(body.required).toEqual(expect.arrayContaining(["platform", "username"]));

  const response = responseSchema("/accounts", "post", "201");
  expect(Object.keys(response.properties ?? {}).toSorted()).toEqual([
    "id",
    "platform",
    "syncId",
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

/** Under OpenAPI 3.1, through `type` or an `anyOf`/`oneOf` branch, never
 * the 3.0-only `nullable: true`. */
function acceptsNull(schema: JsonSchema): boolean {
  if (schema.nullable === true) return false;
  if (Array.isArray(schema.type) && schema.type.includes("null")) return true;
  if (schema.type === "null") return true;
  const branches = schema.anyOf ?? schema.oneOf ?? [];
  return branches.some((branch) => branch.type === "null");
}

it("nullable fields use OpenAPI 3.1 / JSON Schema semantics, not OpenAPI 3.0's `nullable: true`", () => {
  expect(JSON.stringify(spec)).not.toContain('"nullable":true');

  const rows = responseSchema("/games", "get", "200").properties?.["games"];
  const openingName = rows?.items?.properties?.["openingName"];
  expect(openingName).toBeDefined();
  expect(acceptsNull(openingName!)).toBe(true);
});

it("system routes are registered before the identity middleware", () => {
  // Registration order is the guarantee, middleware applying only to
  // routes registered after it. The gate is found by handler name because
  // the edge middleware above these routes would otherwise be mistaken for
  // it.
  const order = harness.app.routes.map((r) => `${r.method} ${r.path} ${r.handler.name}`);
  const at = (needle: string) => order.findIndex((entry) => entry.includes(needle));

  const gate = at("ALL /* sessionGate");
  expect(gate).toBeGreaterThan(-1);
  expect(gate).toBeGreaterThan(at("GET /health/live"));
  expect(gate).toBeGreaterThan(at("GET /health/ready"));
  expect(gate).toBeGreaterThan(at("GET /openapi.json"));
  expect(gate).toBeGreaterThan(at("ALL /auth/*"));

  // Below the gate, because every policy is keyed by the userId it
  // resolves.
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
      "GET /health/live",
      "GET /health/ready",
      "GET /config",
      "GET /openapi.json",
      "GET /docs",
      "ALL /auth/*",
    ]),
  );
});

it("error responses honor the documented { error } contract", async () => {
  const badBody = await owner.request("/accounts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platform: "nope" }),
  });
  expect(badBody.status).toBe(400);
  const bodyError: { error: string; details: string[] } = await badBody.json();
  expect(typeof bodyError.error).toBe("string");
  expect(bodyError.details.length).toBeGreaterThan(0);

  const badParam = await owner.request("/games/not-a-uuid");
  expect(badParam.status).toBe(400);
  const paramError: { error: string } = await badParam.json();
  expect(paramError.error).toBe("invalid id");

  // unknown route → JSON 404, same shape (with a session; without one,
  // the gate answers first and unknown paths 401 like everything else)
  const missing = await owner.request("/nope");
  expect(missing.status).toBe(404);
  const missingError: { error: string } = await missing.json();
  expect(missingError.error).toBe("not found");
});
