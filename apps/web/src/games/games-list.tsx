import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { getRouteApi } from "@tanstack/react-router";
import type * as React from "react";
import { useMemo } from "react";

import { DataTable, DataTablePagination } from "@velachess/ui/components/data-table";
import { PageHeader } from "@velachess/ui/layout/page-header";

import { PgnImportButton } from "./import-pgn/pgn-import-dialog.tsx";
import { SyncGamesButton } from "./import/sync-games-button.tsx";
import { gamesColumns } from "./list/columns.tsx";
import { activeFilterCount, PAGE_SIZE, type GamesSearch } from "./list/filters.ts";
import { GamesFilters } from "./list/games-filters.tsx";
import { libraryQuery, type Game } from "./list/queries.ts";
import { useQuery } from "../libs/react-query.ts";

const GAMES_COPY = {
  title: msg`Games`,
  description: msg`Every game you've imported, and how it went.`,
  emptyArchive: msg`No games yet. Connect Chess.com or Lichess, or import a PGN.`,
  emptyFilters: msg`No games match these filters.`,
  loadError: msg`Couldn't load games.`,
  pagination: msg`Games pages`,
  previous: msg`Previous`,
  next: msg`Next`,
  bullet: msg`Bullet`,
  blitz: msg`Blitz`,
  rapid: msg`Rapid`,
  classical: msg`Classical`,
} as const;

const route = getRouteApi("/_app/games/");

/** Lichess's rule (chess.com's classes line up closely): bucket by estimated duration, not clock alone. Mirrors server's `timeClassOf`. */
const ESTIMATED_MOVES = 40;
const TIME_CLASS_CEILINGS = { bullet: 180, blitz: 480, rapid: 1500 } as const;

function timeClassCopy(game: Game) {
  if (game.timeControlInitialSeconds === null) return null;

  const seconds =
    game.timeControlInitialSeconds +
    ESTIMATED_MOVES * (game.timeControlIncrementSeconds ?? 0);
  if (seconds < TIME_CLASS_CEILINGS.bullet) return GAMES_COPY.bullet;
  if (seconds < TIME_CLASS_CEILINGS.blitz) return GAMES_COPY.blitz;
  if (seconds < TIME_CLASS_CEILINGS.rapid) return GAMES_COPY.rapid;
  return GAMES_COPY.classical;
}

export function GamesList() {
  const { i18n } = useLingui();
  const search = route.useSearch();
  const navigate = route.useNavigate();

  // One library, every source: no account has to exist for this read.
  const query = useQuery(libraryQuery(search));

  const setSearch = (next: Partial<GamesSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...next }) });

  const columns = useMemo(
    () =>
      gamesColumns({
        translate: (message) => i18n._(message),
        formatDate: (iso) => i18n.date(new Date(iso), { day: "numeric", month: "short" }),
        timeClassLabel: (game) => {
          const label = timeClassCopy(game);
          return label ? i18n._(label) : null;
        },
      }),
    [i18n],
  );

  const actions = (
    <div className="flex items-center gap-2">
      <GamesFilters search={search} onChange={setSearch} />
      <PgnImportButton />
      <SyncGamesButton />
    </div>
  );

  const emptyMessage =
    activeFilterCount(search) === 0
      ? i18n._(GAMES_COPY.emptyArchive)
      : i18n._(GAMES_COPY.emptyFilters);

  if (query.isPending) {
    return (
      <GamesScreen actions={actions}>
        <DataTable columns={columns} data={[]} loading empty={emptyMessage} />
      </GamesScreen>
    );
  }

  if (query.isError) {
    return (
      <GamesScreen actions={actions}>
        <DataTable
          columns={columns}
          data={[]}
          loading={false}
          empty={i18n._(GAMES_COPY.loadError)}
        />
      </GamesScreen>
    );
  }

  return (
    <GamesScreen
      actions={actions}
      pagination={
        <GamesPagination
          data={query.data}
          page={search.page}
          onPageChange={(page) => setSearch({ page })}
        />
      }
    >
      <DataTable
        columns={columns}
        data={query.data.games}
        loading={false}
        empty={emptyMessage}
      />
    </GamesScreen>
  );
}

function GamesScreen({
  actions,
  children,
  pagination,
}: {
  actions: React.ReactNode;
  children: React.ReactNode;
  pagination?: React.ReactNode;
}) {
  const { i18n } = useLingui();

  return (
    <>
      <PageHeader
        title={i18n._(GAMES_COPY.title)}
        description={i18n._(GAMES_COPY.description)}
        actions={actions}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-auto p-6">{children}</div>
        {pagination}
      </div>
    </>
  );
}

function GamesPagination({
  data,
  page,
  onPageChange,
}: {
  data: { total: number };
  page: number;
  onPageChange: (page: number) => void;
}) {
  const { i18n } = useLingui();
  const first = data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, data.total);

  return (
    <DataTablePagination
      page={page}
      pageSize={PAGE_SIZE}
      total={data.total}
      onPageChange={onPageChange}
      label={i18n._(GAMES_COPY.pagination)}
      summary={`${i18n.number(first)}–${i18n.number(last)} / ${i18n.number(data.total)}`}
      previousLabel={i18n._(GAMES_COPY.previous)}
      nextLabel={i18n._(GAMES_COPY.next)}
    />
  );
}
