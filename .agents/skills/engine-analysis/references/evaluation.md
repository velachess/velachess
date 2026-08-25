# Evaluation and classification

Engine scores cross VelaChess boundaries in white point of view. A positive
centipawn score favors White; a negative score favors Black. Mate is not a very
large centipawn number: preserve mate distance as a separate score shape.

Move quality uses loss in win chance from the mover's point of view:

```text
white mover: winChance(before) - winChance(after)
black mover: winChance(after) - winChance(before)
```

Clamp gains to zero loss. The played move may still be `best` when its first PV
move matches; otherwise current thresholds map loss to `good`, `inaccuracy`,
`mistake`, or `blunder`. Database deviation severity collapses `best` and
`good` to `ok`.

The authoritative implementation and thresholds are in
`libs/analysis/classify.ts`; score representation is in
`libs/analysis/score.ts`. Tests compare against independent boundaries and
reference games. Do not duplicate numeric thresholds in another consumer or
turn mate into centipawns to reuse a formula.
