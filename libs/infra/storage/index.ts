/**
 * [STORAGE] — bytes under one root on a filesystem. Owns the guarantee
 * that a key cannot escape the root and that a reader never sees a
 * half-written object.
 *
 * Refuses to own what a key means, what a byte sequence is, who may read
 * it, and anything HTTP. Callers decide all four; this library only moves
 * bytes. A cloud backend later is a second `create*Store` satisfying the
 * same function types a slice already declares — not an interface added
 * here now (see libs/infra/AGENTS.md).
 */

export * from "./files.ts";
export * from "./env.ts";
