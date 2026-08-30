/**
 * Repertoire extraction — the descriptive book. Instead of declaring what
 * you intend to play, derive what you DO play: a frequency trie over your
 * games' mainlines, cut where support drops below minGames. Deviations
 * against this book mean "you left your own habitual line" — crossed with
 * engine severity, that is the drilling signal.
 *
 * Pure: games in, lines out. Persistence and naming targets live in the
 * application layer.
 */

import { openingNameFrom } from "@velachess/chess";

export { openingNameFrom } from "@velachess/chess";

export interface ExtractableGame {
  /** Mainline SAN, already replayed and legal. */
  sans: string[];
  openingName?: string | null;
  /** chess.com puts the opening name inside the ECOUrl slug instead of an
   * [Opening] header — the url is the fallback name source. */
  openingUrl?: string | null;
}

export interface ExtractOptions {
  /** Minimum games that must share a position for it to stay in book. */
  minGames?: number;
  /** Book depth cap in plies. */
  maxPlies?: number;
}

export interface ExtractedLine {
  /** Both sides' moves — a chapter is a full line, like manual entry. */
  sans: string[];
  /** Support at the line's deepest position. */
  gameCount: number;
  /** Dominant opening name among supporting games, or "Line N". */
  name: string;
}

interface TrieNode {
  count: number;
  children: Map<string, TrieNode>;
  /** Indices of games that passed through this node. */
  gameIndices: number[];
}

function dominantName(
  games: ExtractableGame[],
  indices: number[],
  fallback: string,
): string {
  const votes = new Map<string, number>();
  for (const index of indices) {
    const name = openingNameFrom({
      name: games[index]?.openingName,
      url: games[index]?.openingUrl,
    });
    if (name) votes.set(name, (votes.get(name) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestVotes = 0;
  for (const [name, count] of [...votes.entries()].toSorted((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (count > bestVotes) {
      best = name;
      bestVotes = count;
    }
  }
  return best ?? fallback;
}

export function extractRepertoireLines(
  games: ExtractableGame[],
  opts: ExtractOptions = {},
): ExtractedLine[] {
  const minGames = opts.minGames ?? 2;
  const maxPlies = opts.maxPlies ?? 12;

  const root: TrieNode = { count: 0, children: new Map(), gameIndices: [] };
  games.forEach((game, index) => {
    if (game.sans.length === 0) return;
    root.count++;
    root.gameIndices.push(index);
    let node = root;
    for (const san of game.sans.slice(0, maxPlies)) {
      let child = node.children.get(san);
      if (!child) {
        child = { count: 0, children: new Map(), gameIndices: [] };
        node.children.set(san, child);
      }
      child.count++;
      child.gameIndices.push(index);
      node = child;
    }
  });

  // A line is a maximal supported path: walk while a child keeps support,
  // branch when several do (each supported branch becomes its own line).
  const lines: Omit<ExtractedLine, "name">[] = [];
  const walk = (node: TrieNode, sans: string[]) => {
    const supported = [...node.children.entries()]
      .filter(([, child]) => child.count >= minGames)
      .toSorted((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));

    if (supported.length === 0) {
      if (sans.length > 0) lines.push({ sans, gameCount: node.count });
      return;
    }
    for (const [san, child] of supported) {
      walk(child, [...sans, san]);
    }
  };
  walk(root, []);

  lines.sort(
    (a, b) =>
      b.gameCount - a.gameCount || a.sans.join(" ").localeCompare(b.sans.join(" ")),
  );

  return lines.map((line, index) => {
    // Supporters of the line = games through its deepest node.
    let node = root;
    for (const san of line.sans) node = node.children.get(san)!;
    return Object.assign({}, line, {
      name: dominantName(games, node.gameIndices, `Line ${index + 1}`),
    });
  });
}
