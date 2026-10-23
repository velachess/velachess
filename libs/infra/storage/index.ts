/**
 * Bytes under one root, guaranteeing only that a key cannot escape it and
 * that a reader never sees a half-written object. What a key means, what
 * the bytes are and who may read them are the caller's.
 *
 * A cloud backend later is a second `create*Store` satisfying the function
 * types a slice already declares, not an interface added here now (see
 * libs/infra/AGENTS.md).
 */

export * from "./files.ts";
export * from "./env.ts";
