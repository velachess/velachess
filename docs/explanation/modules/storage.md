# Storage

`libs/infra/storage`, published as `@velachess/infra-storage`. It moves bytes
under one root on a filesystem, and refuses to know anything else.

```ts
put(key, bytes): Promise<void>
get(key): Promise<Uint8Array | null>
remove(key): Promise<void>
```

Three functions, created with `createFileStore(root)`. That is the whole
surface.

## Why it exists separately

Postgres holds the reference to a profile avatar; the image itself does not
belong in a row. Once binary content exists at all, moving it is a technical
mechanism with its own failure modes — partial writes, absent objects, keys
that try to leave their directory — and `libs/infra` is where a mechanism
lives behind a narrow surface.

## Why there is no provider interface

There is one implementation and no second one is written. `libs/infra/AGENTS.md`
is explicit: _"Do not add a provider abstraction for an imagined future
implementation."_

A cloud backend later costs a second `create*Store` satisfying the function
types a slice already declares for itself — `PutAvatarObject`,
`GetAvatarObject`, `RemoveAvatarObject` in `libs/user`. The seam is already
there, because the slice rule puts it there whether or not a second
implementation exists. An interface added now would be ceremony that buys
nothing and has to be maintained in the meantime.

Two things make the swap cheap when it is real:

- `users.image` is `text`, so an absolute `https://bucket/avatars/<id>.webp`
  drops in beside a relative `/api/me/avatar?v=…` with no migration. Rows
  written by either scheme keep working.
- Nothing above the composition root names this package. `apps/server` route
  files cannot import `libs/infra` at all (`routes-no-direct-infra`), so the
  only file that changes is `apps/server/src/composition/user.ts`.

## Deliberate decisions

**Atomic replace, not write-in-place.** `put` writes to
`<key>.tmp-<uuid>` and renames onto the target. Rename is atomic within a
filesystem, so a request reading an avatar mid-upload sees either the old
object or the new one, never a truncated one. It also means replacing an
object needs no delete, which is what keeps the orphan class empty for a
fixed-key scheme: one key per user, overwritten in place.

**An absent object is `null`, not a throw.** A user with no avatar is an
ordinary state, and a caller maps `null` to a 404. Throwing would surface it
as a 500.

**`remove` of an absent key succeeds.** Cleanup is retryable and removing an
avatar that was never uploaded is not an error path.

**One key check, stating the actual promise.** A key must resolve to a path
inside the root; `..` segments, absolute keys, `.` and the empty key are
refused as a consequence rather than as separate rules. A refused key throws
before the filesystem is touched — sanitising and continuing would hide a
caller bug.

An earlier draft also validated keys against a charset regex. It went: the two
checks guarded the same danger (removing either one left the suite green), and
the regex additionally imposed a lowercase-no-spaces naming convention that has
nothing to do with safety and that a legitimate uppercase hash would trip over.
One check that names the invariant beats two that overlap.

No caller can violate the invariant today — every key is `avatars/<uuid>` built
from the session's user id, never from request input. The check exists because
the invariant belongs to the thing that knows what a root is, rather than to
every present and future caller that happens to hold a string.

**`get` copies into a plain `Uint8Array`.** `readFile` returns a `Buffer`,
which is a `Uint8Array` subclass, so the declared type would pass either way.
Returning it would carry Node-only behaviour across a boundary whose contract
says `Uint8Array` — its own `toJSON`, and pooled backing memory that a view
could alias. One copy of an avatar-sized object is not worth the ambiguity.

**No `hono`, by rule and by design.** `no-hono-outside-server` covers
`libs/infra`, so there are no response or streaming helpers here. Bytes are
buffered, which is correct at this size ceiling (128 KB per avatar) and would
be the wrong shape for large files — a future large-object case wants a stream
on the port, not a workaround at the call site.

## Configuration

`resolveStorageEnv(env)` is pure and takes env as a value, so `apps/server`'s
composition root stays the only place that reads `process.env`. One variable:

| Variable                | Default         | Notes                                       |
| ----------------------- | --------------- | ------------------------------------------- |
| `VELACHESS_STORAGE_DIR` | `.data/storage` | Must be absolute when `NODE_ENV=production` |

The production refusal is not pedantry. A relative root resolves against the
process's working directory, which differs between `pnpm dev:server` at the
repo root and a container's `WORKDIR`. In a container that writes uploads into
the image's own layer, where the next `docker compose up --build` deletes
them — data loss behind a deploy that looks healthy until someone restarts it.

In `docker/docker-compose.yml` the root is `/data`, the mount point of the
`velachess_files` named volume. It belongs in the backup set alongside
`velachess_pgdata`; see `docs/how-to/self-host.md`.
