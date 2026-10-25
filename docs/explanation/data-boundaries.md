# Data boundaries: where a conversion lives

A value that changes shape between the database, the application and the API
changes it at **exactly one named place**, owned by the module that owns the
concept. This page says how to find that place, and what to do when the
architecture forbids sharing the declaration.

## What this repository does not have

Read this first, because importing a pattern that solves a problem we do not
have is how an abstraction arrives unearned.

- **No text column holding JSON.** The three structured columns are `jsonb`
  (`libs/infra/db/schema.ts`), which the driver deserializes. There is no parse
  step to own: **no production file converts a persisted value with
  `JSON.parse`/`JSON.stringify`.** The only occurrences repo-wide serialize
  something that was never a column — SSE frame payloads, the Lingui catalogue,
  and the inline theme bootstrap script. A `z.preprocess` that parses a string
  out of a column is solving someone else's schema.
- **No `numeric`/`decimal`/`real` columns**, so no silent string-for-number.
- **No array columns**, and **no `mode: 'string'` timestamps** — all
  timestamps are `withTimezone: true` at Drizzle's default `mode: 'date'`, so
  `Date` goes in and `Date` comes out. `bigint`/`bigserial` are
  `mode: 'number'`; `count()` carries Drizzle's implicit `mapWith(Number)`.

So the gap is never parsing. It is **validation**, and it is **duplication**.

## Where a conversion goes

Four cases, in the order to test them. They are the sharing rule from
`architecture.md` applied to data shape rather than to behavior.

1. **One slice converts it** → it lives in that slice, even if a near-copy
   exists elsewhere. Small duplication between slices is cheaper than
   coupling.
2. **It is a persistence mechanism several readers share** → `libs/infra/db`.
   The multi-consumer query exception in `architecture.md` covers this, and
   nothing more.
3. **It is a semantic rule about a domain concept** → the module that owns the
   concept, never the caller and never the schema. `AGENTS.md`'s invariant
   splits this three ways: a rule every app and module may need is written
   once in `libs/chess` (a seat, a result read from it, a time class); an
   evaluation policy belongs to `libs/analysis`'s module root; a derivation
   that is provider-specific stays in `libs/infra/platforms` by intent — PGN
   normalization, the movetext dedup hash, a cursor's shape.
4. **It is a wire format** → the app that owns the transport. `apps/server`
   owns `Date → ISO`; `apps/web` owns `Intl` formatting.

There is no fifth case. In particular there is **no global mapper layer, no
`domain/`, no repository per entity, and no `toDto`/`fromDto` pair** — see
`architecture.md`'s "What is deliberately absent", which this page does not
reopen.

## `$type<>()` is documentation, not a guard

Drizzle's `$type<>()` and a `sql<T>` template literal are compile-time
assertions. They narrow what the compiler believes and check nothing at
runtime. Every one of them in this repository is a claim about a column, not a
guarantee about its contents, and the ones that matter say so at the
definition site. Treat an annotated `jsonb` column as `unknown` until
something has actually validated it.

## Which boundaries validate

**Validate** — a value crossing into the application from somewhere we do not
control:

- provider HTTP responses — already done, with `safeParse` and a typed
  failure (`libs/infra/platforms/providers/`); this is the model to copy;
- queue job payloads, at the consume boundary, before any domain call;
- a `jsonb` column read back, when a caller reads inside it;
- a `text` column carrying a closed set with no DB constraint behind it.

A validator must distinguish **absent** from **invalid**. They mean different
things and usually need different handling: a missing cursor is a first sync,
an unreadable one is a fact worth reporting. Collapsing both into a silent
default is how a bad value survives for weeks.

**Do not validate** — a value whose type is already derived from the
declaration that produced it:

- an API response typed through `AppType` and `InferResponseType`. The Hono
  RPC link is stronger than a client-side re-parse, which would duplicate the
  contract rather than tighten it.
- a `pgEnum` column read back, when the enum is derived from a zod schema:
  Postgres enforces the domain and the derivation keeps the union honest.

Adding zod for symmetry is a finding in review, not a neutral choice.

## Derive the type; do not write it twice

When the owning module already depends on zod, the schema is the source and
the TypeScript type is `z.infer`. `libs/infra/platforms/schema.ts` is the
worked example: all four `pgEnum`s in `libs/infra/db/schema.ts` are built from
its `.options`, so a new value fails to compile rather than drifting, and a
module that names one of those concepts imports the type instead of writing
the union again. `platform` was the exception — hand-written literals, with
the union copied into five more files — which is the argument for the rule
rather than a limit on it.

A list and its type count as a duplicate too. Where the runtime list is what
consumers need (`TIME_CLASSES`, `MOVE_CATEGORIES`), the array is the source
and the union is `(typeof X)[number]`.

A literal list written a second time inside the same package — a `Set`, a
union, a `z.enum` — is duplication with no excuse. Replace it with the schema
it copies.

## Repeated literals: when a vocabulary earns a name

A status, an event name, a provider id, a job state. Three cases, and only
the first gets a constant:

1. **The same literal is produced or compared in more than one file, and
   nothing types the two together** — give it one source and import it.
   A _coordination key_ is always this case: when two processes have to
   produce the identical string for anything to work (an advisory-lock key,
   a singleton key, a queue name), a second reading verifies nothing, it
   just has to match. `QUEUES` is the worked example.
2. **A union is declared once and its constructors and comparisons live
   elsewhere** — that is already the single source. TypeScript checks every
   `return { status: … }` against the union and rejects a comparison
   against a value outside it (`TS2367`). Adding a constant object beside
   the union leaves two definitions to keep in step, which is worse than
   the literal it replaced.
3. **The literal appears once, next to its own explanation** — leave it
   inline. A name for a single use is indirection, not documentation.

A route or a test that restates an importable union is case 2, not case 1:
`apps/server/src/routes/accounts.ts`'s `ACCOUNT_SYNC_STATUS` mirrors
`@velachess/accounts`' `RequestSyncOutcome`, and a wrong value there fails the
build at the comparison. Centralising it buys readability, never safety —
`apps/server/src/status.ts` states when that trade is worth making in this
app, and when a status stays local to the one file that branches on it.

`libs/accounts/sync-status.ts` is case 1 done: "a sync is still on its way"
was a `Set` in three slices plus a SQL list, and dropping a status from any
of them failed no test. It answers through a **type predicate** rather than
exporting the list, because `list-accounts` uses the status it just checked —
`includes` returns a plain boolean and throws that narrowing away. `apps/web`
keeps its own over its own vocabulary: a job settles on `succeeded`/`failed`
while an account's `syncStatus` collapses both into `idle`, and the frontend
must not import a backend module to learn the active sets coincide.

Slice vocabularies are a deliberate exception to all three: a slice names
the states it answers with in its own words rather than importing a
callee's type.

## Mirror plus drift guard, when sharing is forbidden

Some duplication is **mandated**, not sloppy:

- `.dependency-cruiser.cjs`'s `routes-no-direct-infra` forbids
  `apps/server/src/routes/*` from importing `libs/infra/*`, with no type-only
  exemption. A route's `z.enum` is therefore a copy by design.
- `apps/web` does not depend on `@velachess/infra-platforms`, and should not:
  that package carries provider HTTP clients a browser has no business
  bundling.
- `libs/chess` is the pure package `apps/web` bundles. It could import
  `libs/infra/platforms` — `domain-stays-pure` does not forbid that edge — but
  must not: that package carries provider HTTP clients. So `GameResult` is
  stated in both, guarded from the package that depends on each
  (`libs/infra/platforms/tests/result-vocabulary.test.ts`).

For these, the answer is not to force the import. It is to mirror the shape
and make a drift **fail the build**, in the module that owns the concept:

```ts
// libs/infra/platforms/tests/result-vocabulary.test.ts
const toChessResult: GameResult = {} as StoredGameResult;
const fromChessResult: StoredGameResult = {} as GameResult;
```

Mutual assignability, checked at typecheck, in the test file of the module
that depends on both. A mirror without a guard is drift waiting to happen —
and a guard in the wrong package is the import you were avoiding.

A SQL predicate is the same problem with a different answer, because it runs
inside Postgres and can call nothing. `AGENTS.md` settles it: such a
predicate **says which rule it expresses** and is **held to it by a route
test**, never by shared code. `libs/chess/game-result.ts` and
`libs/infra/db/queries/sync-jobs.ts` both carry that sentence at the
definition site.

A derived enum gets the mechanical version instead, asserted against its
source: see `libs/infra/db/tests/schema.test.ts`, which covers all four. For a
vocabulary a route has to retype, the served OpenAPI document is the thing to
assert against — `apps/server/tests/openapi.test.ts` checks that each
canonical list still appears in it, so editing a route's `z.enum` fails by
name.

## A schema that documents a conversion should perform it

`@hono/zod-openapi` validates **requests**: `defaultHook`
(`apps/server/src/validation.ts`) fires on `param`, `json` and `query`. A
response schema is OpenAPI documentation and is not applied at runtime, so a
handler that hand-writes the conversion the schema describes can disagree with
it and still typecheck — `Object.assign` widens, and nothing fails.

When a response schema states a conversion, make the schema the conversion and
let the handler call it. One declaration, read and write in agreement. Weigh
the cost: parsing a long list on the way out is real work, and scoping the
transform to the responses that need it, with a comment saying why, beats
applying it everywhere by reflex.

## What review asks

For any changed value that crosses a boundary:

- Which single place converts it, and does the module that owns the concept
  own that place?
- Is the shape asserted or validated? If asserted, what happens when the
  assertion is false?
- Can the reader tell absent from invalid?
- If the declaration is duplicated, is the duplication mandated — and does a
  drift guard fail the build?
- Does a test exist that can fail when the conversion is wrong, with an oracle
  that did not come from reading the implementation?

## Related

- `docs/explanation/architecture.md` — the sharing rule and the dependency
  direction this page specialises
- `docs/how-to/add-a-migration.md` — the column stores a fact, the query
  answers a question
- `docs/how-to/write-a-test.md` — the seam a test controls, and "two readings,
  on purpose"
- `.agents/skills/architecture-review` — placing a conversion
- `.agents/skills/code-review` — reviewing one
