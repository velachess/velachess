# Player perspective and results

A PGN records white, black, and the scoresheet result. It does not identify the
current VelaChess user.

`games.perspective` is explicit only when an imported PGN declared a side.
Provider-synced games normally store `null`; VelaChess derives the side by
matching the tracked account username to the normalized player names. The
current shared TypeScript rule is `libs/application/perspective.ts`; SQL
consumers restate the same expression where importing application code would
break a boundary.

Every consumer must preserve the same semantics:

- stored `white` or `black` wins when present;
- otherwise compare the tracked handle case-insensitively with both seats;
- unresolved perspective remains `null`, never guessed;
- the opponent and owner outcome are derived only after perspective resolves.

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
