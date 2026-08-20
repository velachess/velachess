/**
 * Position index — groups every node in a repertoire tree by its position
 * key, so a position reached via one branch exposes the continuations
 * prepared under any other branch that transposes into the same position.
 */

import type { ChildNode } from "@velachess/chess";

import type { RepertoireNodeData, RepertoireTree } from "./tree.ts";

export type PositionIndex = Map<string, ChildNode<RepertoireNodeData>[]>;

export function buildPositionIndex(tree: RepertoireTree): PositionIndex {
  const index: PositionIndex = new Map();

  const visit = (node: RepertoireTree) => {
    for (const child of node.children) {
      const bucket = index.get(child.data.positionKey);
      if (bucket) bucket.push(child);
      else index.set(child.data.positionKey, [child]);
      visit(child);
    }
  };

  visit(tree);
  return index;
}
