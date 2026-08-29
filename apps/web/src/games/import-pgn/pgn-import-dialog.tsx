import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useState } from "react";

import { Button } from "@velachess/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@velachess/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@velachess/ui/components/field";
import { Input } from "@velachess/ui/components/input";
import { toast } from "@velachess/ui/components/toast";
import { FileText } from "@velachess/ui/icons";
import { cn } from "@velachess/ui/lib/utils";

import { useImportPgn } from "./queries.ts";

const COPY = {
  action: msg`Import PGN`,
  title: msg`Import games from a PGN`,
  description: msg`Paste a PGN or pick a file. Your games join the same library — nothing is connected and nothing syncs.`,
  playerName: msg`Your name in these games`,
  playerNameHint: msg`As it appears in the White and Black headers`,
  playerRequired: msg`Enter your name so your games can be told apart from your opponents'.`,
  file: msg`PGN file`,
  paste: msg`Or paste the moves`,
  pastePlaceholder: msg`[Event "..."] …`,
  pgnRequired: msg`There is nothing to import yet.`,
  submit: msg`Import`,
  importing: msg`Importing…`,
} as const;

const RESULT_COPY = {
  done: msg`Games imported`,
  duplicates: msg`{count, plural, one {One was already in your library.} other {# were already in your library.}}`,
  rejected: msg`{count, plural, one {One game could not be read.} other {# games could not be read.}}`,
  failedTitle: msg`Import failed`,
  failedDescription: msg`Couldn't reach the server. Try again.`,
} as const;

/**
 * The manual source's entry point. Chess.com and Lichess connect through
 * Import games; this is the separate, repeatable upload — no account row
 * behind it, nothing remembered on this device.
 */
export function PgnImportButton() {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <FileText data-icon="inline-start" />
            {i18n._(COPY.action)}
          </Button>
        }
      />
      <DialogContent aria-labelledby={DIALOG_TITLE_ID}>
        <DialogHeader>
          <DialogTitle id={DIALOG_TITLE_ID}>{i18n._(COPY.title)}</DialogTitle>
          <DialogDescription>{i18n._(COPY.description)}</DialogDescription>
        </DialogHeader>
        <ImportPgnForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

const DIALOG_TITLE_ID = "pgn-import-title";

type Translate = (message: MessageDescriptor) => string;

function ImportPgnForm({ onDone }: { onDone: () => void }) {
  const { i18n } = useLingui();
  const [playerName, setPlayerName] = useState("");
  const [pgn, setPgn] = useState("");
  const [touched, setTouched] = useState(false);

  const importPgn = useImportPgn({
    onImported: (outcome) => {
      announce(outcome, (message) => i18n._(message));
      onDone();
    },
    onError: () => {
      toast.add({
        type: "error",
        title: i18n._(RESULT_COPY.failedTitle),
        description: i18n._(RESULT_COPY.failedDescription),
      });
    },
  });

  const playerNameInvalid = touched && playerName.trim().length === 0;
  const pgnInvalid = touched && pgn.trim().length === 0;

  const submit = () => {
    setTouched(true);
    if (playerName.trim().length === 0 || pgn.trim().length === 0) return;
    importPgn.mutate({ pgn, playerName: playerName.trim() });
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    // A .pgn is plain text by definition; read it into the paste field so
    // there is exactly one place the import reads from.
    setPgn(await file.text());
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field data-invalid={playerNameInvalid}>
        <FieldLabel htmlFor="pgn-player-name">{i18n._(COPY.playerName)}</FieldLabel>
        <Input
          id="pgn-player-name"
          aria-label={i18n._(COPY.playerName)}
          value={playerName}
          aria-invalid={playerNameInvalid}
          onChange={(event) => setPlayerName(event.target.value)}
          disabled={importPgn.isPending}
        />
        <FieldLabel
          htmlFor="pgn-player-name"
          className="text-muted-foreground font-normal"
        >
          {i18n._(COPY.playerNameHint)}
        </FieldLabel>
        {playerNameInvalid && <FieldError>{i18n._(COPY.playerRequired)}</FieldError>}
      </Field>

      <Field data-invalid={pgnInvalid}>
        <FieldLabel htmlFor="pgn-file">{i18n._(COPY.file)}</FieldLabel>
        <Input
          id="pgn-file"
          type="file"
          accept=".pgn,text/plain"
          aria-label={i18n._(COPY.file)}
          onChange={(event) => void readFile(event.target.files?.[0])}
          disabled={importPgn.isPending}
        />

        <FieldLabel htmlFor="pgn-paste">{i18n._(COPY.paste)}</FieldLabel>
        <textarea
          id="pgn-paste"
          rows={6}
          value={pgn}
          placeholder={i18n._(COPY.pastePlaceholder)}
          aria-invalid={pgnInvalid}
          onChange={(event) => setPgn(event.target.value)}
          disabled={importPgn.isPending}
          className={cn(inputClassName(pgnInvalid), "font-mono text-xs")}
        />
        {pgnInvalid && <FieldError>{i18n._(COPY.pgnRequired)}</FieldError>}
      </Field>

      <div className="flex justify-end">
        <Button type="submit" disabled={importPgn.isPending}>
          {importPgn.isPending ? i18n._(COPY.importing) : i18n._(COPY.submit)}
        </Button>
      </div>
    </form>
  );
}

/** Same token classes the shared Input wears, adapted to multi-line content — local until a second consumer earns a primitive. */
function inputClassName(invalid: boolean): string {
  return cn(
    "w-full rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none",
    "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
    invalid && "border-destructive ring-3 ring-destructive/20",
  );
}

/** The receipt names every pile: what landed, what was already there, what couldn't be read. */
function announce(
  outcome: { duplicates: number; rejected: number },
  translate: Translate,
) {
  const notes = [
    outcome.duplicates > 0 &&
      translate({ ...RESULT_COPY.duplicates, values: { count: outcome.duplicates } }),
    outcome.rejected > 0 &&
      translate({ ...RESULT_COPY.rejected, values: { count: outcome.rejected } }),
  ].filter(Boolean);

  toast.add({
    type: "success",
    title: translate(RESULT_COPY.done),
    ...(notes.length > 0 ? { description: notes.join(" ") } : {}),
  });
}
