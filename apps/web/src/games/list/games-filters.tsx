import { useLingui } from "@lingui/react";

import { Badge } from "@velachess/ui/components/badge";
import { Button } from "@velachess/ui/components/button";
import { Checkbox } from "@velachess/ui/components/checkbox";
import { FieldLabel, FieldLegend, FieldSet } from "@velachess/ui/components/field";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@velachess/ui/components/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@velachess/ui/components/select";
import { Separator } from "@velachess/ui/components/separator";
import { ToggleGroup, ToggleGroupItem } from "@velachess/ui/components/toggle-group";
import { cn } from "@velachess/ui/lib/utils";
import { Filter } from "@velachess/ui/icons";

import { TIME_CLASSES, type TimeClass } from "@velachess/chess";

import {
  activeFilterCount,
  CHOICE_GROUPS,
  CLEARED_FILTERS,
  FILTERS_COPY,
  SOURCE_OPTIONS,
  type GamesSearch,
} from "./filters.ts";
import { TIME_CLASS_MARKS } from "./time-class-marks.tsx";

/** A select has to hold something; the URL holds `undefined` instead. */
const ANY_SOURCE = "all";

export interface GamesFiltersProps {
  search: GamesSearch;
  onChange: (next: Partial<GamesSearch>) => void;
}

/** Every change applies on the spot and resets to page 1: narrowing while
 * parked on page 7 shows an empty list and reads as broken. */
export function GamesFilters({ search, onChange }: GamesFiltersProps) {
  const { i18n } = useLingui();
  const active = activeFilterCount(search);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" className={cn("relative", triggerStyle(active > 0))}>
            <Filter data-icon="inline-start" />
            {i18n._(FILTERS_COPY.label)}
            <ActiveFilterBadge active={active} />
          </Button>
        }
      />
      <PopoverContent align="end" className="w-72 max-w-(--available-width) gap-3">
        <div className="flex items-center justify-between gap-2">
          <PopoverTitle>{i18n._(FILTERS_COPY.label)}</PopoverTitle>
          {/* Disabled rather than absent: appearing with the first choice
              would move the groups under the cursor. */}
          <Button
            variant="ghost"
            size="sm"
            disabled={active === 0}
            onClick={() => onChange(CLEARED_FILTERS)}
          >
            {i18n._(FILTERS_COPY.reset)}
          </Button>
        </div>

        <Separator />

        {CHOICE_GROUPS.map((group) => (
          <ChoiceGroup
            key={group.key}
            group={group}
            search={search}
            onChange={onChange}
          />
        ))}

        <TimeControlGroup search={search} onChange={onChange} />
        <SourceChoice search={search} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

function triggerStyle(isFiltering: boolean): string {
  if (!isFiltering) return "";
  return "border-primary text-primary hover:text-primary";
}

/**
 * Out of the flow: counted inline, the badge would resize the trigger with
 * the first choice and the open popover would jump after it. Solid rather
 * than the tinted `info`, which the trigger shows straight through, and
 * ringed in the page's own colour so it reads as sitting on the edge.
 */
function ActiveFilterBadge({ active }: { active: number }) {
  if (active === 0) return null;

  return (
    <Badge className="absolute -top-1.5 -right-1.5 w-5 px-0 ring-2 ring-background tabular-nums">
      {active}
    </Badge>
  );
}

function ChoiceGroup({
  group,
  search,
  onChange,
}: {
  group: (typeof CHOICE_GROUPS)[number];
  search: GamesSearch;
  onChange: (next: Partial<GamesSearch>) => void;
}) {
  const { i18n } = useLingui();
  // A second `search[group.key]` read would not narrow: TS tracks the
  // truthy check on this binding alone.
  const value = search[group.key];
  const selected = value ? [value] : [];

  return (
    <FieldSet className="gap-1.5">
      <FieldLegend variant="label">{i18n._(group.label)}</FieldLegend>
      <ToggleGroup
        value={selected}
        variant="outline"
        size="sm"
        className="flex-wrap justify-start"
        onValueChange={(next) => onChange({ [group.key]: next[0] ?? undefined, page: 1 })}
      >
        {group.options.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {i18n._(option.label)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </FieldSet>
  );
}

/** Several at once, so checkboxes rather than chips: the server matches
 * any of them. */
function TimeControlGroup({
  search,
  onChange,
}: {
  search: GamesSearch;
  onChange: (next: Partial<GamesSearch>) => void;
}) {
  const { i18n } = useLingui();
  const selected = search.timeClass ?? [];

  const handleToggle = (value: TimeClass) => {
    const next = selected.includes(value)
      ? selected.filter((kept) => kept !== value)
      : [...selected, value];
    onChange({ timeClass: next.length === 0 ? undefined : next, page: 1 });
  };

  return (
    <FieldSet className="gap-1.5">
      <FieldLegend variant="label">{i18n._(FILTERS_COPY.timeControl)}</FieldLegend>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {TIME_CLASSES.map((timeClass) => (
          <TimeControlOption
            key={timeClass}
            timeClass={timeClass}
            checked={selected.includes(timeClass)}
            onToggle={handleToggle}
          />
        ))}
      </div>
    </FieldSet>
  );
}

function TimeControlOption({
  timeClass,
  checked,
  onToggle,
}: {
  timeClass: TimeClass;
  checked: boolean;
  onToggle: (value: TimeClass) => void;
}) {
  const { i18n } = useLingui();
  const { label, Mark } = TIME_CLASS_MARKS[timeClass];

  return (
    <FieldLabel className="font-normal">
      <Checkbox checked={checked} onCheckedChange={() => onToggle(timeClass)} />
      <Mark className="size-3.5 text-muted-foreground" />
      {i18n._(label)}
    </FieldLabel>
  );
}

function SourceChoice({
  search,
  onChange,
}: {
  search: GamesSearch;
  onChange: (next: Partial<GamesSearch>) => void;
}) {
  const { i18n } = useLingui();
  const items = [
    { value: ANY_SOURCE, label: i18n._(FILTERS_COPY.allSources) },
    ...SOURCE_OPTIONS,
  ];

  // Only the catalogue's own ids narrow; anything else, `ANY_SOURCE`
  // included, widens.
  const handleChange = (next: unknown) => {
    const chosen = SOURCE_OPTIONS.find((option) => option.value === next);
    onChange({ source: chosen?.value, page: 1 });
  };

  return (
    <FieldSet className="gap-1.5">
      <FieldLegend variant="label">{i18n._(FILTERS_COPY.source)}</FieldLegend>
      <Select
        items={items}
        value={search.source ?? ANY_SOURCE}
        onValueChange={handleChange}
      >
        <SelectTrigger
          size="sm"
          aria-label={i18n._(FILTERS_COPY.source)}
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldSet>
  );
}
