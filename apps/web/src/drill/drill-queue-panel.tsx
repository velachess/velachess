import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";

import { Button } from "@velachess/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@velachess/ui/components/card";

import type { DrillQueue } from "./queries.ts";

const QUEUE_COPY = {
  today: msg`Today`,
  start: msg`Start drilling`,
  reviews: msg`reviews`,
  fresh: msg`new`,
  toDrill: msg`to drill`,
} as const;

export interface DrillQueuePanelProps {
  queue: DrillQueue;
  onStart: () => void;
}

export function totalWaiting(queue: DrillQueue): number {
  return queue.due + queue.fresh;
}

/** e.g. "7 reviews · 5 new" — a zero half is omitted, not printed as "0 new". */
function sessionShape(
  queue: DrillQueue,
  labels: { reviews: string; fresh: string },
): string {
  const parts: string[] = [];
  if (queue.due > 0) parts.push(`${queue.due} ${labels.reviews}`);
  if (queue.fresh > 0) parts.push(`${queue.fresh} ${labels.fresh}`);
  return parts.join(" · ");
}

export function DrillQueuePanel({ queue, onStart }: DrillQueuePanelProps) {
  const { i18n } = useLingui();
  const total = totalWaiting(queue);

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardDescription>{i18n._(QUEUE_COPY.today)}</CardDescription>
        <CardTitle className="text-2xl">
          {total} {i18n._(QUEUE_COPY.toDrill)}
        </CardTitle>
        <CardDescription>
          {sessionShape(queue, {
            reviews: i18n._(QUEUE_COPY.reviews),
            fresh: i18n._(QUEUE_COPY.fresh),
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={onStart}>{i18n._(QUEUE_COPY.start)}</Button>
      </CardContent>
    </Card>
  );
}
