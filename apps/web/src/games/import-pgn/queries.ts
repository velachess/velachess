import { api, parseResponse } from "../../shared/api/client.ts";
import { useMutation, useQueryClient } from "../../shared/libs/query/index.ts";

/** What POST /games/import reports, all three counts at once. */
export type ImportPgnOutcome = {
  imported: number;
  duplicates: number;
  rejected: number;
  judged: number;
  seeded: number;
};

export interface ImportPgnInput {
  pgn: string;
  playerName?: string;
}

/**
 * The one call a manual upload needs: no account to create, nothing to
 * remember on this device afterwards — the refetch tells the story.
 */
export function useImportPgn(handlers: {
  onImported: (outcome: ImportPgnOutcome) => void;
  onError: () => void;
}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ImportPgnInput) =>
      parseResponse(api.games.import.$post({ json: input })),
    onSuccess: async (outcome) => {
      handlers.onImported(outcome);
      await queryClient.invalidateQueries();
    },
    onError: handlers.onError,
  });
}
