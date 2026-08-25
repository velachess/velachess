# Exercises and scheduling

An exercise is the trainable position and answer. An exercise source records
why it exists. A card is the user's FSRS schedule for that exercise. A review is
one scheduled showing; it is not Stockfish analysis.

Current sources are:

- `repertoire-deviation`: a played deviation with an expected continuation;
- `engine-blunder`: an eligible engine-classified ply from a persisted report;
- `repertoire-line`: a prepared decision position from a chapter, seeded when
  the chapter is added or extracted so preparation can be studied before it is
  missed in a game.

Seeding is idempotent by source identity. One exercise may carry multiple
sources; counts by origin therefore need not sum to the number of exercises.
Inspect `exercise_sources` before diagnosing a candidate as missing.

Unscoped selection prefers due cards, then unseen exercises according to the
owning slice's stable ordering. Repertoire/chapter scope narrows both pools so
line study does not bury or bypass the ordinary mistake queue. `due` is derived
from the card timestamp, not stored as a second boolean.

Study chooses prepared content; review is one scheduled showing after an
exercise has a card. Answer submission checks the move, records the response,
and updates the card in the same user-owned workflow.

FSRS mechanics belong to `libs/scheduler`; drill eligibility, source creation,
selection, and persistence belong to the corresponding application slices and
database constraints. Do not expose FSRS as the product vocabulary or create a
second scheduler in UI/application code.
