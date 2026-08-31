/**
 * DeleteRepertoire — remove a repertoire the user owns. Judgment history
 * survives: deviations keep their name snapshots and repertoire_id turns
 * null (ON DELETE SET NULL).
 */
import type { Repertoire } from "@velachess/infra-db";

type RemoveRepertoire = (
  userId: string,
  repertoireId: string,
) => Promise<Repertoire | null>;

export interface DeleteRepertoireDeps {
  removeRepertoire: RemoveRepertoire;
}

export async function deleteRepertoire(
  deps: DeleteRepertoireDeps,
  userId: string,
  repertoireId: string,
): Promise<Repertoire | null> {
  return deps.removeRepertoire(userId, repertoireId);
}
