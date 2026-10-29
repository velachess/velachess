import { PgnImportButton, SyncGamesButton } from "../import/index.ts";
import type { GamesSearch } from "./filters.ts";
import { GamesFilters } from "./games-filters.tsx";
import { GamesSearchBox } from "./games-search.tsx";

/** Finding a game on the left, filling the library on the right. */
export function GamesToolbar({
  search,
  onChange,
}: {
  search: GamesSearch;
  onChange: (next: Partial<GamesSearch>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <GamesSearchBox opponent={search.opponent} onChange={onChange} />
      <GamesFilters search={search} onChange={onChange} />
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <PgnImportButton />
        <SyncGamesButton />
      </div>
    </div>
  );
}
