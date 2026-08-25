# VelaChess review checklist

Use only the sections touched by the change. Verify live code rather than
treating this checklist as an implementation map.

## Correctness and contracts

- Does the implementation satisfy the stated intent on success, refusal,
  empty, retry, and partial-failure paths?
- Can malformed or absent data reach a path that assumes it is present?
- Do API status codes and `{ error, details? }` responses remain consistent?
- Did a new server route enter `apps/server/src/openapi.ts`?
- Can the changed test fail when production behavior is wrong, or does it only
  agree with a hand-authored oracle derived from the implementation?

## Data, isolation, and loss

- Is every user-owned read/write scoped in the query, not filtered after
  loading another user's row?
- Are public provider handles kept distinct from session identity and account
  ownership?
- Do uniqueness, upsert, delete, and cascade choices preserve independent
  tracked-account histories and existing user data?
- Are stored and derived values interpreted through the same rule everywhere?
- Do transactional pairs still commit or roll back together?

## Security

- Check authorization, trusted origins, redirects, cookies, secret handling,
  rate limits, outbound URL construction, and error disclosure when relevant.
- Load `security-review` for any auth/OAuth/provider HTTP change.

## Architecture and operations

- Does behavior remain in its owning slice, mechanism, or domain library?
- Are app composition roots thin and are infra details kept out of application?
- Are pg-boss delivery and advisory-lock execution ownership still distinct?
- Does the change preserve local, self-hosted, and hosted deployment modes?
- Is custom infrastructure replacing a native library/platform primitive?

## Review output

```text
[P1|P2|P3] concise finding
location: path:line
impact: observable failure or violated invariant
evidence: traced contradiction or missing independent oracle
direction: smallest credible correction, without implementing it
```
