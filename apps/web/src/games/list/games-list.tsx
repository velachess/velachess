import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import type * as React from "react";
import { useMemo } from "react";

import { timeClassOf, type TimeClass } from "@velachess/chess";
import { buttonVariants } from "@velachess/ui/components/button";
import { DataTable, DataTablePagination } from "@velachess/ui/components/data-table";
import { PageHeader } from "@velachess/ui/layout/page-header";

import { PgnImportButton } from "../import/index.ts";
import { SyncGamesButton } from "../import/index.ts";
import { gamesColumns } from "./columns.tsx";
import { activeFilterCount, PAGE_SIZE, type GamesSearch } from "./filters.ts";
import { GamesFilters } from "./games-filters.tsx";
import { libraryQuery, type Game } from "./queries.ts";
import { useQuery } from "../../libs/react-query.ts";

const GAMES_COPY = {
  title: msg`Games`,
  description: msg`Every game you've imported, and how it went.`,
  emptyArchive: msg`No games yet. Connect Chess.com or Lichess, or import a PGN.`,
  connect: msg`Connect an account`,
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

/** The class is the shared rule's answer; this screen only names it. */
const TIME_CLASS_COPY: Record<TimeClass, MessageDescriptor> = {
  bullet: GAMES_COPY.bullet,
  blitz: GAMES_COPY.blitz,
  rapid: GAMES_COPY.rapid,
  classical: GAMES_COPY.classical,
};

function timeClassCopy(game: Game) {
  const timeClass = timeClassOf(
    game.timeControlInitialSeconds,
    game.timeControlIncrementSeconds,
  );
  return timeClass ? TIME_CLASS_COPY[timeClass] : null;
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

  // An empty library is a dead end without a way out of it: the header's
  // Sync button needs a connection to sync, so the empty row carries the
  // one action that creates one. Filtered-to-nothing is a different
  // emptiness — the games exist, the filters hide them.
  const emptyMessage =
    activeFilterCount(search) === 0 ? (
      <div className="flex flex-col items-center gap-3">
        <span>{i18n._(GAMES_COPY.emptyArchive)}</span>
        <Link to="/import" className={buttonVariants({ size: "sm" })}>
          {i18n._(GAMES_COPY.connect)}
        </Link>
      </div>
    ) : (
      i18n._(GAMES_COPY.emptyFilters)
    );

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
