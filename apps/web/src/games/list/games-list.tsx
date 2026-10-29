import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { getRouteApi, Link } from "@tanstack/react-router";
import { useRef, type Ref, type ReactNode } from "react";

import { buttonVariants } from "@velachess/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyTitle,
} from "@velachess/ui/components/empty";
import { Skeleton } from "@velachess/ui/components/skeleton";
import { PageHeader } from "@velachess/ui/layout/page-header";

import { isNarrowed, type GamesSearch } from "./filters.ts";
import { GameItem } from "./game-item.tsx";
import { GamesPagination } from "./games-pagination.tsx";
import { GamesToolbar } from "./games-toolbar.tsx";
import { libraryQuery } from "./queries.ts";
import { useQuery } from "../../libs/react-query.ts";

const GAMES_COPY = {
  title: msg`Games`,
  description: msg`Every game you've imported, and how it went.`,
  count: msg`{count, plural, one {# game} other {# games}}`,
  emptyArchive: msg`No games yet. Connect Chess.com or Lichess, or import a PGN.`,
  connect: msg`Connect an account`,
  emptyFilters: msg`No games match these filters.`,
  emptyPage: msg`No games on this page.`,
  loadError: msg`Couldn't load games.`,
  loading: msg`Loading games`,
} as const;

const route = getRouteApi("/_app/games/");

const SKELETON_ROWS = 6;

export function GamesList() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const results = useRef<HTMLDivElement>(null);

  const setSearch = (next: Partial<GamesSearch>) =>
    navigate({ search: (previous) => ({ ...previous, ...next }) });

  const scrollToTop = () => {
    if (results.current) results.current.scrollTop = 0;
  };

  return (
    <GamesScreen search={search} onChange={setSearch} results={results}>
      <GamesResults search={search} onNavigate={scrollToTop} />
    </GamesScreen>
  );
}

/** One library, every source: no account has to exist for this read. */
function GamesResults({
  search,
  onNavigate,
}: {
  search: GamesSearch;
  onNavigate: () => void;
}) {
  const { i18n } = useLingui();
  const query = useQuery(libraryQuery(search));

  if (query.isPending) return <GamesSkeleton />;
  if (query.isError) return <GamesEmpty title={i18n._(GAMES_COPY.loadError)} />;
  if (query.data.games.length === 0) {
    return <GamesNothing search={search} total={query.data.total} />;
  }

  return (
    <>
      {/* A real list rather than `ItemGroup`, whose `div` cannot
          hold the `li` each row needs. */}
      <ul aria-label={i18n._(GAMES_COPY.title)} className="flex w-full flex-col">
        {query.data.games.map((game) => (
          <li key={game.id} className="border-b last:border-b-0">
            <GameItem game={game} />
          </li>
        ))}
      </ul>
      {/* The page the rows came from, not the one in the URL: a read
          in flight would otherwise number stale rows as the new
          page. */}
      <GamesPagination
        total={query.data.total}
        page={query.data.page}
        onNavigate={onNavigate}
      />
    </>
  );
}

/** Its own subscription with its own `select`, and always rendered:
 * appearing once the count is known would push the toolbar down. */
function GamesCount({ search }: { search: GamesSearch }) {
  const { i18n } = useLingui();
  const total = useQuery({
    ...libraryQuery(search),
    select: (library) => library.total,
  }).data;

  return (
    <p className="min-h-5 text-sm text-muted-foreground tabular-nums">
      {total !== undefined && i18n._({ ...GAMES_COPY.count, values: { count: total } })}
    </p>
  );
}

function GamesSkeleton() {
  const { i18n } = useLingui();

  return (
    <div aria-busy aria-label={i18n._(GAMES_COPY.loading)} className="flex flex-col">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <div key={index} className="flex items-center gap-3 px-2 py-3 sm:px-3">
          <Skeleton className="size-14 rounded-md sm:size-20" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
          <Skeleton className="h-5 w-14 rounded-4xl" />
        </div>
      ))}
    </div>
  );
}

/** Only one of the three is a dead end: the header's Sync button needs a
 * connection to sync, so an empty library carries the action that creates
 * one. */
function GamesNothing({ search, total }: { search: GamesSearch; total: number }) {
  const { i18n } = useLingui();

  // The library has games; this page of it does not.
  if (total > 0) return <GamesEmpty title={i18n._(GAMES_COPY.emptyPage)} />;

  if (isNarrowed(search)) return <GamesEmpty title={i18n._(GAMES_COPY.emptyFilters)} />;

  return (
    <GamesEmpty title={i18n._(GAMES_COPY.emptyArchive)}>
      <Link to="/import" className={buttonVariants({ size: "sm" })}>
        {i18n._(GAMES_COPY.connect)}
      </Link>
    </GamesEmpty>
  );
}

function GamesEmpty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
      {children && <EmptyContent>{children}</EmptyContent>}
    </Empty>
  );
}

function GamesScreen({
  search,
  onChange,
  children,
  results,
}: {
  search: GamesSearch;
  onChange: (next: Partial<GamesSearch>) => void;
  children: ReactNode;
  results: Ref<HTMLDivElement>;
}) {
  const { i18n } = useLingui();

  return (
    <>
      {/* One scroller: header, rows and pager move together. `relative`
          is load-bearing — an `sr-only` label is absolutely positioned,
          and with no positioned ancestor it stretches the document far
          past the frame. */}
      <div ref={results} className="relative min-h-0 flex-1 overflow-auto">
        <PageHeader
          title={i18n._(GAMES_COPY.title)}
          description={i18n._(GAMES_COPY.description)}
          meta={<GamesCount search={search} />}
          bottom={<GamesToolbar search={search} onChange={onChange} />}
        />
        <div className="p-4 md:p-6">{children}</div>
      </div>
    </>
  );
}
