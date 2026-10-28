import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import type * as React from "react";
import { useState } from "react";

import { Button } from "@velachess/ui/components/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@velachess/ui/components/item";
import { FileText, Upload, X } from "@velachess/ui/icons";

const COPY = {
  input: msg`PGN file`,
  prompt: msg`Drag and drop or choose a .pgn file`,
  hint: msg`One file, as many games as it holds`,
  remove: msg`Remove file`,
} as const;

const SIZE_UNITS = ["byte", "kilobyte", "megabyte"] as const;

function formatSize(bytes: number, i18n: I18n): string {
  const step = Math.min(
    Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)),
    SIZE_UNITS.length - 1,
  );

  return i18n.number(bytes / 1024 ** step, {
    style: "unit",
    unit: SIZE_UNITS[step],
    unitDisplay: "narrow",
    maximumFractionDigits: 1,
  });
}

/**
 * The label is the only picker trigger — the whole zone opens it natively,
 * so there is no second control to keep in sync. Its height is fixed so a
 * picked file never resizes the dialog.
 */
export function PgnDropzone({
  file,
  onPicked,
  onRemoved,
  disabled,
  invalid,
}: {
  file: File | null;
  onPicked: (file: File) => void;
  onRemoved: () => void;
  disabled: boolean;
  invalid: boolean;
}) {
  const { i18n } = useLingui();
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    if (!disabled) setIsDragging(true);
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    const dropped = event.dataTransfer.files[0];
    if (dropped) onPicked(dropped);
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.currentTarget.files?.[0];
    // Cleared so picking the same file again still fires a change event.
    event.currentTarget.value = "";
    if (picked) onPicked(picked);
  }

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- a label for a file input is the interaction; the drop handlers extend it to the area it covers
    <label
      data-dragging={isDragging || undefined}
      data-selected={file ? true : undefined}
      data-invalid={invalid || undefined}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className="flex min-h-50 cursor-pointer flex-col items-center justify-center gap-4 overflow-hidden rounded-lg border border-input border-dashed p-6 text-center transition-colors hover:bg-accent/50 has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:pointer-events-none has-disabled:opacity-50 data-dragging:border-ring data-dragging:bg-accent/50 data-selected:border-solid data-invalid:border-destructive"
    >
      <input
        type="file"
        accept=".pgn,text/plain"
        aria-label={i18n._(COPY.input)}
        onChange={handleChange}
        disabled={disabled}
        className="sr-only"
      />

      <Upload aria-hidden="true" className="size-10 stroke-1 text-muted-foreground" />

      {!file && (
        <>
          <p className="text-base font-medium">{i18n._(COPY.prompt)}</p>
          <p className="text-sm text-muted-foreground">{i18n._(COPY.hint)}</p>
        </>
      )}

      {file && (
        <Item variant="outline" className="bg-background text-left">
          <ItemMedia variant="icon">
            <FileText />
          </ItemMedia>
          <ItemContent className="min-w-0">
            <ItemTitle className="block w-full truncate" title={file.name}>
              {file.name}
            </ItemTitle>
            <ItemDescription>{formatSize(file.size, i18n)}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={i18n._(COPY.remove)}
              disabled={disabled}
              onClick={onRemoved}
            >
              <X />
            </Button>
          </ItemActions>
        </Item>
      )}
    </label>
  );
}
