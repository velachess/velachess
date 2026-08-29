import { useLingui } from "@lingui/react";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@velachess/ui/components/card";
import { Skeleton } from "@velachess/ui/components/skeleton";
import { PageHeader } from "@velachess/ui/layout/page-header";

import { useQuery } from "../shared/libs/query/index.ts";
import { overviewQuery, type Overview } from "./queries.ts";

const DASHBOARD_COPY = {
  title: msg`Dashboard`,
  description: msg`Your games, your repertoire, your mistakes.`,
  unavailable: msg`—`,
  counters: {
    games: { label: msg`Games`, hint: msg`imported from your accounts` },
    deviations: { label: msg`Deviations`, hint: msg`found in your repertoire` },
    exercises: { label: msg`Exercises`, hint: msg`made from your worst ones` },
    dueCards: { label: msg`Due now`, hint: msg`waiting for you today` },
  },
} as const;

const COUNTERS = [
  { key: "games", ...DASHBOARD_COPY.counters.games },
  { key: "deviations", ...DASHBOARD_COPY.counters.deviations },
  { key: "exercises", ...DASHBOARD_COPY.counters.exercises },
  { key: "dueCards", ...DASHBOARD_COPY.counters.dueCards },
] satisfies { key: keyof Overview; label: MessageDescriptor; hint: MessageDescriptor }[];

export function Dashboard() {
  const { i18n } = useLingui();

  return (
    <>
      <PageHeader
        title={i18n._(DASHBOARD_COPY.title)}
        description={i18n._(DASHBOARD_COPY.description)}
      />

      <div className="flex flex-col gap-6 overflow-auto p-6">
        <Counters />
      </div>
    </>
  );
}

/**
 * Counters keep their frame: only the numbers are absent while loading.
 *
 * Asked once, not polled — importing is a single read that invalidates
 * every query when it lands. And never rendered as four zeroes for a new
 * account: `onboarding/` holds that screen over the whole app until there
 * is something to count.
 */
function Counters() {
  const { i18n } = useLingui();
  const query = useQuery(overviewQuery);

  if (query.isError) {
    return <CounterCards unavailable={i18n._(DASHBOARD_COPY.unavailable)} />;
  }
  if (query.isSuccess) return <CounterCards data={query.data} />;

  return <CounterCards loading />;
}

type CounterCardsProps = { loading: true } | { data: Overview } | { unavailable: string };

/**
 * One cell, in whichever state the card is. Early returns rather than a
 * chain: each state is a sentence of its own, and the narrowing that
 * makes `props.data` legal is the same thing that makes them exclusive.
 */
function CounterCell({
  counter,
  ...props
}: CounterCardsProps & { counter: keyof Overview }) {
  if ("loading" in props) return <CounterValue counter={counter} loading />;
  if ("unavailable" in props) {
    return <CounterValue counter={counter} unavailable={props.unavailable} />;
  }
  return <CounterValue data={props.data} counter={counter} />;
}

function CounterCards(props: CounterCardsProps) {
  const { i18n } = useLingui();

  return (
    <section className="grid gap-4 @2xl/content:grid-cols-2 @5xl/content:grid-cols-4">
      {COUNTERS.map(({ key, label, hint }) => (
        <Card key={key}>
          <CardHeader>
            <CardDescription>{i18n._(label)}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              <CounterCell counter={key} {...props} />
            </CardTitle>
            <CardDescription className="text-xs">{i18n._(hint)}</CardDescription>
          </CardHeader>
        </Card>
      ))}
    </section>
  );
}

type CounterValueProps =
  | { counter: keyof Overview; loading: true }
  | { counter: keyof Overview; data: Overview }
  | { counter: keyof Overview; unavailable: string };

function CounterValue(props: CounterValueProps) {
  if ("loading" in props) return <Skeleton className="h-9 w-20" />;
  if ("unavailable" in props) return props.unavailable;
  return formatCount(props.data[props.counter]);
}

/** Intl now so a thousands separator is never hand-rolled later. */
const countFormatter = new Intl.NumberFormat();
const formatCount = (value: number) => countFormatter.format(value);
