/**
 * CreateRepertoire — start a manual repertoire: a name and a color to hang
 * chapters on, no games or extraction involved.
 */
import type { Repertoire } from "@velachess/infra-db";

export interface CreateRepertoireInput {
  name: string;
  color: "white" | "black";
}

type InsertRepertoire = (input: {
  userId: string;
  name: string;
  color: "white" | "black";
  source: "manual";
}) => Promise<Repertoire>;

export interface CreateRepertoireDeps {
  insertRepertoire: InsertRepertoire;
}

export async function createRepertoire(
  deps: CreateRepertoireDeps,
  userId: string,
  input: CreateRepertoireInput,
): Promise<Repertoire> {
  return deps.insertRepertoire({ userId, ...input, source: "manual" });
}
