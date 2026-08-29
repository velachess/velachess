---
name: security-review
description: Review VelaChess authentication, Better Auth, Google OAuth, callbacks, redirects, cookies, sessions, trusted origins, secrets, account linking, user authorization, tenant isolation, rate limits, provider HTTP, and SSRF-sensitive outbound URLs. Use for security-focused review or whenever these boundaries change.
---

# Review VelaChess security boundaries

Read the nearest `AGENTS.md` and live auth/provider configuration. Focus on
VelaChess's current attack surfaces rather than producing a generic security
checklist.

Trace:

1. **Identity:** who establishes the session and which trusted origin/cookie
   rules apply in local, self-hosted, and hosted deployments.
2. **Authorization:** whether each user-owned read/write is scoped in the query
   and another user's identifier is indistinguishable from a missing one.
3. **OAuth and redirects:** whether callback paths, allowed origins, error
   destinations, and return URLs are fixed or validated rather than reflected.
4. **Account linking:** whether credential/Google collisions have an explicit,
   tested outcome. A matching email alone must not silently merge identities;
   preserve Better Auth's current linking policy and the UI's
   `account_not_linked` handling unless the product deliberately changes both.
5. **Secrets and cookies:** whether secrets are required/validated at startup,
   never logged or exposed, and secure-cookie behavior cannot be weakened in a
   production path.
6. **Outbound HTTP:** whether provider hosts are fixed, user input is limited to
   handles/known ids, responses are schema-validated, and errors/rate limits do
   not disclose credentials or create retry storms.
7. **Abuse controls:** whether Better Auth and API rate limits remain on the
   correct side of the session boundary without duplicate competing limiters.

Prefer Better Auth, Hono, URL, database constraints, and provider-client
primitives over custom authentication, redirect, cookie, or HTTP frameworks.
Report concrete exploitability, data exposure, isolation failure, or weakened
defense; do not flag theoretical hardening with no relevant path.
