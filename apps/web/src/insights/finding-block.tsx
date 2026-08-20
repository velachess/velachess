import type * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@velachess/ui/components/card";
import { cn } from "@velachess/ui/lib/utils";

/**
 * The one shape every finding renders through, whatever its kind.
 *
 * The editorial order is fixed on purpose — conclusion, then why it
 * matters, then the numbers it stands on, then the way out — because
 * that order *is* the product: a screen that led with the numbers would
 * be a dashboard wearing a different title. Kinds differ in what they
 * say (the adapters in finding-views.tsx own the copy) and in the
 * supporting visual they bring; they do not differ in structure.
 *
 * `emphasis` is how priority becomes hierarchy: the top-ranked finding
 * arrives as `hero` and gets the display face and the accent border,
 * everything else reads as a list entry. Equal cards for unequal
 * findings would un-rank what the server ranked.
 */
export interface FindingBlockProps {
  emphasis?: "hero" | "standard";
  /** Small label above the headline — a book's name, an opening. */
  eyebrow?: string | undefined;
  /** The conclusion, readable on its own. */
  headline: string;
  /** Why it matters — one sentence, never a paragraph. */
  interpretation?: string | undefined;
  /** The sample the claim stands on. Every finding has one. */
  evidence: string;
  /** Kind-specific supporting visual (bars, a comparison). Optional:
   * removing it must leave the block still worth reading. */
  children?: React.ReactNode;
  /** Progressive disclosure — affected games, per-phase breakdowns. */
  details?: { summary: string; content: React.ReactNode } | undefined;
  /** The way out, already rendered (a typed Link needs literal routes). */
  action?: React.ReactNode;
}

export function FindingBlock({
  emphasis = "standard",
  eyebrow,
  headline,
  interpretation,
  evidence,
  children,
  details,
  action,
}: FindingBlockProps) {
  const hero = emphasis === "hero";

  return (
    <Card className={cn(hero && "border-brand/40")} data-emphasis={emphasis}>
      <CardHeader>
        {eyebrow ? <CardDescription>{eyebrow}</CardDescription> : null}
        <CardTitle className={cn(hero && "font-display text-2xl")}>{headline}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {interpretation !== undefined && <p className="text-sm">{interpretation}</p>}
        {children}
        <p className="text-muted-foreground text-sm">{evidence}</p>

        {details !== undefined && (
          <details className="group">
            <summary className="text-muted-foreground cursor-pointer list-none text-sm underline-offset-4 hover:underline">
              {details.summary}
            </summary>
            <div className="pt-3">{details.content}</div>
          </details>
        )}

        {/*
          The action rides in the content, not in a `CardFooter`.

          The footer slot paints a tinted, top-bordered band and switches
          the card's bottom padding off — right for a dialog's button
          bar, wrong here: findings sit side by side in one grid, only
          some of them have a way out, and the ones that did ended in a
          different colour from the ones beside them. A card should not
          change shape because its content happens to be actionable.
        */}
        {action !== undefined && <div>{action}</div>}
      </CardContent>
    </Card>
  );
}
