import { useLingui } from "@lingui/react";

import { Badge } from "@velachess/ui/components/badge";
import { Button } from "@velachess/ui/components/button";
import { FieldGroup, FieldLegend, FieldSet } from "@velachess/ui/components/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@velachess/ui/components/popover";
import { ToggleGroup, ToggleGroupItem } from "@velachess/ui/components/toggle-group";
import { Filter } from "@velachess/ui/icons";

import {
  activeFilterCount,
  FILTER_GROUPS,
  FILTERS_COPY,
  type GamesSearch,
} from "./filters.ts";

export interface GamesFiltersProps {
  search: GamesSearch;
  onChange: (next: Partial<GamesSearch>) => void;
}

/**
 * One button instead of a row of them.
 *
 * Every change resets to page 1: a filter that narrows the list while
 * leaving you on page 7 shows an empty table and looks broken.
 */
export function GamesFilters({ search, onChange }: GamesFiltersProps) {
  const { i18n } = useLingui();
  const active = activeFilterCount(search);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            // A narrowed list is the screen's most important fact, and
            // the control that narrowed it is closed. The trigger wears
            // the same accent the chosen chips inside it wear, so "this
            // list is filtered" is legible without opening anything.
            className={triggerStyle(active > 0)}
          >
            <Filter data-icon="inline-start" />
            {i18n._(FILTERS_COPY.trigger)}
            <ActiveFilterBadge active={active} />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-64">
        <FieldGroup className="gap-4">
          {FILTER_GROUPS.map((group) => {
            // A second `search[group.key]` read here would not narrow —
            // TS only tracks the truthy-check on this exact binding.
            const value = search[group.key];
            const selected = value ? [value] : [];
            return (
              <FieldSet key={group.key} className="gap-1.5">
                <FieldLegend variant="label">{i18n._(group.label)}</FieldLegend>
                <ToggleGroup
                  value={selected}
                  variant="outline"
                  size="sm"
                  className="flex-wrap justify-start"
                  onValueChange={(next) =>
                    onChange({
                      [group.key]: next[0] ?? undefined,
                      page: 1,
                    })
                  }
                >
                  {group.options.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value}>
                      {i18n._(option.label)}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </FieldSet>
            );
          })}
        </FieldGroup>

        <ClearFilters active={active} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

function triggerStyle(isFiltering: boolean): string {
  if (!isFiltering) return "";
  return "border-primary text-primary hover:text-primary";
}

/** The count, not a dot: "how many rules are narrowing this" is the
 * question someone looking at a short list actually has. */
function ActiveFilterBadge({ active }: { active: number }) {
  if (active === 0) return null;
  return <Badge variant="info">{active}</Badge>;
}

function ClearFilters({
  active,
  onChange,
}: {
  active: number;
  onChange: (next: Partial<GamesSearch>) => void;
}) {
  const { i18n } = useLingui();

  if (active === 0) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        onChange({
          color: undefined,
          outcome: undefined,
          timeClass: undefined,
          page: 1,
        })
      }
    >
      {i18n._(FILTERS_COPY.clear)}
    </Button>
  );
}
