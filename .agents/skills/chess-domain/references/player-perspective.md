# Player perspective and results

A PGN records white, black, and the scoresheet result. It does not identify the
current VelaChess user.

`games.perspective` is explicit for manually imported PGNs: the import slice
resolves the named player's seat per game against the White/Black headers
(case-insensitively), so one file may mix colors, and a game naming them on
neither side stores `null`. Provider-synced games store `null`; VelaChess
derives the side by matching the provenance account's username (left join —
absent on manual rows) to the normalized player names. The current shared
TypeScript rule is `libs/chess/perspective.ts` (a pure, dependency-free
function every business module that needs it — games, repertoires,
insights — imports directly); SQL consumers restate the same expression
where importing it would break the infra-to-module boundary.

Every consumer of an owner-derived fact must preserve the same semantics:

- stored `white` or `black` wins when present;
- otherwise compare the provenance account handle case-insensitively with both seats;
- no account (manual import) or an unresolved match remains `null`, never guessed;
- owner outcome and owner-relative move selection require resolved perspective.

An unattributed PGN may still need a stable seat label for presentation. Such a
fallback is UI behavior, not a resolved opponent or evidence about the owner.

PGN result is seat-relative:

```text
1-0      white won
0-1      black won
1/2-1/2 draw
*        unfinished or unknown
```

“I won” requires both result and resolved perspective. A filter using the raw
stored column while a list uses derived perspective is a correctness bug even
when each query looks locally reasonable.

When a screen/query starts reading one of these facts, verify that its fixture
contains the account username, both player names, result, and any explicit
perspective it intends to exercise.
