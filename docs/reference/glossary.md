# Chess Software Domain Glossary

## Purpose

This glossary gives the team a shared vocabulary for chess software: how
games and positions are represented, how chess rules are modeled, and how
engines such as Stockfish communicate and calculate. The key mental model:
PGN stores games, FEN stores positions, SAN describes moves for humans, UCI
connects software to engines, and an engine calculates chess analysis.

Canonical references: the PGN specification, FIDE Laws of Chess, and
Stockfish/UCI documentation. This glossary is deliberately library-agnostic —
it defines concepts and protocols, not any particular implementation's API.
Where a specific engine is named (Stockfish), it's because that project's
documentation functions as the de facto canonical reference for UCI, the
same way FIDE's text is canonical for rules.

Out of scope: chess strategy and tactics vocabulary (fork, pin, zugzwang,
opposition, and similar). Those are pattern/coaching concepts for a future
analysis or drilling glossary, not representation/protocol concepts.

## Games, positions, and notation

**PGN — Portable Game Notation**: A plain-text format for storing an entire
chess game: metadata, move sequence, result, comments, annotations, and
optional alternative variations. It solves interchange and archival of games
between chess applications. Source note: PGN Specification.

**PGN TAGS**: Metadata fields attached to a PGN game. The standard Seven Tag
Roster is Event, Site, Date, Round, White, Black, and Result; Event
identifies the competition, Date the game date, White/Black the players, and
Result the outcome. They solve searchable game metadata. Source note: PGN
Specification.

**PGN MOVETEXT**: The part of a PGN containing the actual sequence of moves,
normally written in SAN, together with annotations, comments, variations,
and the final result marker (`1-0`, `0-1`, `1/2-1/2`, or `*` for
unfinished/unknown). It separates chess history from PGN metadata. Source
note: PGN Specification.

**PGN COMMENT**: Free-form explanatory text stored alongside moves, enclosed
in `{ }`. Comments are used for human analysis, coaching notes, engine
information, or other annotations that cannot be represented by a simple
symbol. Source note: PGN Specification.

**PGN VARIATION / RAV**: Recursive Annotation Variation; an alternative
sequence of moves stored in parentheses `( )` inside a PGN. Variations let
software represent "instead of this move, this line could have been
played." Because a RAV can contain another RAV, nested variations
(subvariations) form a game tree rather than a flat list. Source note: PGN
Specification.

**NAG — Numeric Annotation Glyph**: A numeric, language-independent PGN
annotation such as `$1` or `$2`; NAGs encode judgments traditionally shown
as symbols such as "!", "?", "!!", or positional assessments. They let
software store annotations consistently without depending on language or
typography. Source note: PGN Specification.

**FEN — Forsyth-Edwards Notation**: A compact one-line description of one
chess position, not a complete game. A FEN records piece placement, side to
move, castling availability, en-passant target, half-move clock, and
fullmove number. It solves position serialization and reconstruction.
Source note: FEN Specification.

**EPD — Extended Position Description**: A FEN-derived notation that keeps
piece placement, side to move, castling rights, and en-passant target, but
drops the half-move clock and fullmove number. Two positions reached by
different move orders often have identical piece placement and rights but
different move counters — a full FEN treats them as different strings even
though they're the same position for legality and preparation purposes; EPD
collapses them to the same key. The full EPD standard also allows optional
trailing "opcodes" (e.g. best-move or comment annotations); software that
truncates a FEN to its first four fields for use as a position key is
applying only EPD's positional core, not the opcode extension. Source note:
EPD Specification (part of the same specification family as FEN/PGN).

**POSITION**: The complete state needed to continue a chess game from a
specific moment — pieces, side to move, and rule-relevant state such as
castling and en-passant availability. FEN is the standard portable
serialization of this state, but "position" is the abstract concept; a
position can also depend on move history for rules like repetition (see
Threefold Repetition), which a single FEN cannot express. Source note: FEN
Specification.

**ALGEBRAIC NOTATION**: The general chess notation system based on named
board squares such as e4 and piece identifiers such as N for knight. It
provides the vocabulary from which SAN is built and is the usual
human-readable way of recording chess. Source note: PGN Specification.

**SAN — Standard Algebraic Notation**: The standard human-readable notation
for a legal move, containing enough information to identify the move plus
captures, promotion, check, or checkmate when applicable. PGN uses canonical
SAN for its moves. Source note: PGN Specification.

**LAN — Long Algebraic Notation**: A more explicit algebraic representation
that usually includes both origin and destination information. It is useful
internally or for debugging because moves are less dependent on contextual
interpretation. Not to be confused with UCI's coordinate notation (below) —
LAN is a PGN-adjacent human notation predecessor to SAN, coordinate notation
is UCI's wire format. Source note: PGN Specification identifies LAN as a
longer predecessor of SAN.

**COORDINATE NOTATION**: A move representation based purely on origin and
destination squares, such as `e2e4`, with a trailing piece letter for
promotion (`e7e8q`). UCI uses this compact representation when engines and
applications exchange moves. It is machine-friendly rather than
presentation-oriented. Source note: UCI/Stockfish documentation.

**PLY**: One move by one player, also called a half-move. White moving once
is one ply; Black responding is another. Engine search depths and many
internal game-tree calculations are naturally expressed in plies. Source
note: FEN Specification and Stockfish documentation.

**HALF-MOVE CLOCK**: The FEN counter tracking plies since the last pawn move
or capture. It exists to support the fifty-move rule (see Threefold
Repetition). It is part of position state, not the move number displayed to
players. Source note: FEN Specification.

**FULLMOVE NUMBER**: The FEN field representing the normal chess move
number. It starts at 1 and increases after Black moves. It allows software
to retain where the position sits in normal game numbering. Source note:
FEN Specification.

## Chess rules and move semantics

**LEGAL MOVE**: A move permitted by the chess rules in the current position,
including the requirement that a player may not leave or place their own
king under attack. Legal moves are the fundamental output of a chess-rules
move generator. Source note: FIDE Laws of Chess.

**MOVE GENERATION**: The process of computing the moves available from a
position. Rules layers and engines rely on it for gameplay, validation,
search, tactics, and analysis. Correct move generation must account for
king safety and special rules such as castling and en passant. Source note:
FIDE Laws of Chess (legality); Stockfish documentation (engine-side
implementation).

**PSEUDO-LEGAL MOVE**: A candidate move that follows the movement rules of a
piece but has not necessarily passed every king-safety legality check.
Engines may use pseudo-legal moves internally for efficiency before
filtering invalid ones. Source note: Stockfish documentation.

**CHECK**: A state in which a king is under attack. The player must respond
so the king is no longer under attack; leaving one's own king attacked is
illegal. This status is required for move validation and SAN generation.
Source note: FIDE Laws of Chess.

**CHECKMATE**: A position where the king is under attack and the player has
no legal way to escape. Checkmate immediately wins the game for the
attacking side. Source note: FIDE Laws of Chess.

**STALEMATE**: A position where the player to move has no legal move but is
not in check; the game is drawn. Software must distinguish stalemate from
checkmate because both have zero legal moves but different outcomes. Source
note: FIDE Laws of Chess.

**INSUFFICIENT MATERIAL / DEAD POSITION**: A position where checkmate cannot
possibly occur is a draw. FIDE's rule (Article 5.2.2) is the broad "dead
position" concept — neither side can checkmate by any legal sequence.
Software commonly implements the narrower, enumerable "insufficient
material" cases (K vs K, K+minor vs K, same-colored-bishop endings) rather
than the fully general dead-position test. Source note: FIDE Laws of Chess,
Article 5.2.2.

**THREEFOLD REPETITION**: A draw rule triggered when the same position (same
side to move, same castling/en-passant rights) occurs three times. Under
current FIDE rules this is a player _claim_, not automatic — the automatic
equivalent is fivefold repetition. The parallel pair exists for the
fifty-move rule (claimable) versus the seventy-five-move rule (automatic).
This matters architecturally: determining "is the game over" needs position
_history_, not just the current FEN. Source note: FIDE Laws of Chess,
Articles 9.2–9.3 (claimable) and 9.6 (automatic).

**CASTLING RIGHTS**: Position state recording whether each side retains the
potential right to castle kingside and/or queenside. They cannot be
inferred from piece locations alone because a king or rook may have moved
and returned. FEN explicitly preserves this history-dependent information.
Source note: FEN Specification and FIDE Laws of Chess.

**EN PASSANT**: A special pawn capture available immediately after an
opposing pawn advances two squares and meets the conditions defined by the
chess rules. Software must preserve the relevant state because legality
depends on the previous move. FEN includes an en-passant target field.
Source note: FIDE Laws of Chess and FEN Specification.

**PROMOTION**: The mandatory replacement of a pawn reaching its final rank
by a queen, rook, bishop, or knight of the same color. Promoting to
anything other than a queen is sometimes called underpromotion. Chess
software must treat the chosen promotion piece as part of the move itself.
Source note: FIDE Laws of Chess; UCI encodes the promotion piece as a
trailing letter on the move string (e.g. `e7e8q`).

**CHESS960 / FISCHER RANDOM**: A chess variant that randomizes the initial
arrangement of the back-rank pieces while retaining specialized castling
rules. Software must explicitly support its altered starting positions and
castling semantics. Source note: Stockfish documentation (native Chess960
support).

**VARIANT**: A ruleset derived from standard chess that changes starting
positions, legal moves, victory conditions, or other rules. Variant-
awareness matters because a position or move may be valid under one ruleset
and invalid under another. Source note: no single canonical spec — each
variant defines its own rule deltas from FIDE standard chess.

**PERFT**: A correctness test that recursively generates strictly legal
moves to a chosen depth and counts resulting leaf nodes. Known counts allow
engine developers to detect bugs in move generation, castling, en passant,
promotion, and legality handling. Source note: Stockfish exposes perft
specifically as a debugging function.

**FSRS — Free Spaced Repetition Scheduler**: An open spaced-repetition
algorithm that models memory per card with two continuous variables —
stability (how slowly recall decays) and difficulty — updated on every
review from a four-value answer (again/hard/good/easy), and schedules the
next review for the moment predicted recall drops to a target retention.
Cards move through four phases: new, learning, review, and relearning
(after a lapse). Source note: open-spaced-repetition project, FSRS v6.

**DUE**: A scheduled card whose next-review time has passed. Being due is
a relationship between the card's stored due date and the clock — derived
at read time, never stored as its own flag.

**DRILLABLE**: A judged deviation that deserves to become a drilling
exercise: the player's own move (not the opponent's), with a prepared
answer to recall, and confirmed by engine analysis to have actually hurt
the position. Deviations to equally good moves and deviations not yet
analyzed are excluded — a review queue full of non-mistakes teaches
nothing.

**ADHERENCE**: How faithfully a player follows their own prepared
repertoire in real games. A game is unfaithful only when the player
deviates from their own prepared line; the opponent leaving book (a gap)
or the preparation simply running out (book-ended) are not the player's
fault and count as faithful. Adherence rate is faithful games over judged
games; games below a minimum ply floor are skipped as too short to say
anything. A companion pair of win rates — inside vs. outside book —
answers the separate question of whether the preparation is actually
helping.

## Engines and analysis

**ENGINE**: A chess program that searches positions and evaluates candidate
moves to determine strong continuations. An engine does not inherently
provide a board UI, coaching language, PGN management, or move labels such
as "blunder"; those are separate application responsibilities. Source note:
Stockfish describes itself as a UCI chess engine without a GUI.

**STOCKFISH**: A free, open-source UCI chess engine used to analyze
positions and calculate strong moves and continuations. It is normally run
as a separate command-line/headless program and controlled by another
application through UCI. Source note: official Stockfish repository and
documentation.

**EVALUATION / EVAL**: An engine's numerical assessment of a chess position
after search. It summarizes how favorable the position appears under strong
play. It is evidence about position quality, not by itself a human
explanation of why a move is good or bad. Source note: Stockfish
documentation explicitly separates evaluations from move annotations.

**SCORE PERSPECTIVE**: UCI reports evaluations and mate scores relative to
the side to move, not in an absolute (e.g. always-White) frame. An
application that stores or compares evaluations across plies must
explicitly normalize perspective, or scores silently flip sign every other
move. This is one of the most common correctness bugs in chess-analysis
software. Source note: UCI protocol documentation.

**CENTIPAWN / CP**: The conventional numeric scale used for non-mating
engine evaluations, historically 100 centipawns to one pawn. Modern
Stockfish normalizes this scale around expected winning chances, so it
should not be interpreted as literal material difference. Source note:
Stockfish FAQ.

**WDL — Win/Draw/Loss**: A probability-based evaluation output (percentage
chance of winning, drawing, or losing under the engine's model) offered
alongside or instead of a centipawn score by modern NNUE-based engines. It
gives an application a normalized severity measure that behaves more
consistently across game phases than raw centipawn deltas. Source note:
Stockfish documentation (UCI WDL output).

**MATE SCORE**: An engine result indicating that a forced checkmate has been
found rather than giving an ordinary centipawn evaluation. The sign
indicates which side is mating or being mated, while the magnitude
expresses distance according to the engine/UCI convention. Source note:
Stockfish UCI documentation.

**PV — Principal Variation**: The sequence of moves the engine currently
considers the best continuation from the analyzed position. It answers
"what line is the engine expecting after this evaluation?" and is central
to displaying engine analysis. Source note: Stockfish terminology and UCI
output.

**MULTIPV**: An engine mode that returns the top N candidate moves and a
principal variation for each instead of only the single best line. Useful
when an application wants several reasonable alternatives. Source note:
Stockfish exposes MultiPV as a UCI option.

**DEPTH**: A search-progress measure related to how far the engine is
searching in the game tree, usually discussed in plies. In modern selective
engines, the displayed depth is not a guarantee that every branch was
searched uniformly that far. Source note: Stockfish terminology and FAQ.

**NODE**: A position examined during the engine's search tree. Node counts
provide a hardware- and search-related measure of how much work has been
performed, and can be used as a deterministic analysis limit. Source note:
Stockfish UCI supports node-limited searches and reports nodes.

**NODES PER SECOND / NPS**: The approximate number of search nodes an
engine processes per second. It is primarily a performance metric for
engine execution and hardware, not a direct measure of chess strength or
analysis quality. Source note: Stockfish reports NPS in UCI analysis and
benchmark output.

**BITBOARD**: A compact internal board representation using bits of a
machine integer to represent sets of chessboard squares. Bitboards make
many attack, occupancy, and move-generation operations efficient. They are
an implementation concept, not a chess file format. Source note: Stockfish
documentation/source.

**TRANSPOSITION TABLE / TT**: An engine cache that stores results from
positions already searched so the engine can reuse that work when the same
position is reached through a different move order. Positions are typically
keyed by a Zobrist hash (a fast, incrementally-updatable position hash), not
by FEN string comparison. Source note: Stockfish terminology.

**HASH**: In normal Stockfish configuration, Hash means the amount of
memory allocated to the transposition table. Increasing it allows more
searched positions to be retained before being replaced. It is memory for
search caching, not a cryptographic hash setting. Source note: Stockfish
UCI and terminology documentation.

**OPENING BOOK**: A database of known opening positions and preferred moves
that can select opening moves without performing a full engine search each
time. Polyglot is a widely used opening-book file format. UCI itself
defines no book format or requirement — opening-book handling is left to
the controlling application. Source note: UCI/Stockfish documentation.

**REPERTOIRE**: A player's prepared set of chosen replies for a given side
(White or Black), covering some subset of opening theory: one committed
move at each of the player's own decision points, and one or more
anticipated replies at each opponent decision point. It is drilling and
preparation content, not a rules or protocol concept — there is no single
canonical file format the way there is for FEN or PGN, though PGN with
variations (RAV) is the common way to encode one, since a repertoire's
own-move/opponent-replies structure is naturally a tree. Distinct from an
opening book (above): a book is typically a shared, often engine- or
database-derived move-selection source; a repertoire is one player's own,
specific, chosen preparation. Source note: no single canonical spec — chess
drilling software commonly stores a repertoire as a PGN-with-variations
tree or a proprietary equivalent.

**TRANSPOSITION**: Reaching the identical position via two different move
orders. In opening theory, transpositions matter because the resulting
position determines what's actually "known" or "prepared," not the specific
sequence of moves that got there. Software that keys stored positions by
move history rather than by the position itself will fail to recognize a
transposition; keying by position instead (e.g. by EPD, above) is what
makes recognition possible. Not to be confused with an engine's
TRANSPOSITION TABLE (below) — that's a search-time cache keyed similarly by
position, but it serves an unrelated purpose (reusing search work, not
recognizing opening preparation). Source note: standard opening-theory
terminology across chess literature; contrast with TRANSPOSITION TABLE
below.

**TABLEBASE**: A precomputed database giving exact results for sufficiently
small endgame positions. Unlike normal engine search, tablebase information
can provide mathematically exact win/draw/loss information within its
supported piece count. Source note: Stockfish UCI documentation (Syzygy
tablebase support).

**NNUE — Efficiently Updatable Neural Network**: The neural-network
evaluation system used by modern engines including Stockfish to estimate
position quality efficiently during search. It is the evaluation component
inside the engine, not a language model or standalone coaching AI. Source
note: Stockfish terminology and NNUE documentation.

**PONDER**: Engine analysis performed while waiting for the opponent's
move, usually based on the reply the engine expects. In interactive engine
play it can reuse otherwise idle thinking time. Source note: Stockfish UCI
documentation (`Ponder` option, `ponderhit` command).

**MOVE CLASSIFICATION / ACCURACY**: An application-layer label (e.g.
"blunder", "excellent") or aggregate score attached to a move or game,
derived from comparing evaluations before and after the move. This is not
defined by UCI or any engine — it's a convention each application invents,
typically using either a flat evaluation-loss threshold or a win-probability
based severity measure. No single canonical formula exists across the
industry. Source note: none — application-layer convention, not a protocol
or spec concept.

## Engine communication and software boundaries

**UCI — Universal Chess Interface**: An open text-based protocol through
which a chess application communicates with an engine. It solves
interoperability: the application manages the product/UI while the engine
receives positions and search commands and returns evaluations, lines, and
moves. Source note: original UCI documentation and Stockfish UCI docs.

**UCI PROTOCOL BASICS**: A typical UCI session starts by initializing the
engine, discovering its options, supplying a position, requesting a search,
receiving streaming `info` results, and finally receiving a best move.
Communication normally occurs through textual standard input and output.
Source note: Stockfish developer and UCI documentation.

**UCI OPTIONS**: Configuration parameters advertised by a UCI engine and
changed by the controlling application — Threads, Hash, MultiPV, Ponder,
Chess960 support, strength limits, and tablebase configuration are common
examples. They let software tune resources and analysis behavior without
changing engine code. Source note: Stockfish UCI documentation.

**BESTMOVE**: The final move selected by a UCI engine after a requested
search completes. It is the machine-facing answer to "which move does the
engine currently choose?" and may also include an expected reply for
pondering. Source note: Stockfish UCI examples.

**ENGINE GUI**: In UCI terminology, the controlling side of the protocol —
not necessarily a graphical desktop interface. Any program that launches
and drives an engine (a desktop app, a web backend, a CLI tool) is "the
GUI" from the engine's point of view. Source note: Stockfish explicitly
ships without a GUI and expects an independent controlling application.

**HEADLESS ENGINE**: An engine designed to operate without its own
graphical chess interface, controlled programmatically through UCI. This
separation allows web, desktop, server, or other interfaces to reuse the
same engine. Source note: official Stockfish documentation.

**UCI VS XBOARD/WINBOARD**: UCI and the Chess Engine Communication Protocol
used by XBoard/WinBoard are two distinct protocols for connecting chess
engines to controlling applications. A program must speak the protocol
supported by its engine, or use an adapter between them. Source note:
Shredder UCI documentation, GNU XBoard materials, and Stockfish
documentation.

**RULES LIBRARY**: A category of software library that models chess
legality, positions, move generation, FEN, SAN, PGN, and game-ending rules
without being a chess-playing engine. This layer answers "is this move
legal?" rather than "what is the strongest move?" Examples of this category
include chess.js, chessops, and python-chess — named here only as
illustrative examples of the category, not as the source of any concept
above.

## Ratings

**ELO / RATING**: A numerical rating system used to estimate relative
playing strength based on competitive results. Ratings are meaningful
within a defined rating pool and conditions; they are not position
evaluations. Source note: FIDE Rating Regulations.

**ENGINE ELO**: A relative strength estimate produced by engine-versus-
engine testing under specified hardware, time controls, openings,
opponents, and other conditions. An engine rating requires context and
should not be treated as automatically equivalent to FIDE human Elo. Source
note: Stockfish FAQ.
