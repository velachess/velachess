import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@velachess/ui/components/field";
import { Input } from "@velachess/ui/components/input";
import { Textarea } from "@velachess/ui/components/textarea";
import { toast } from "@velachess/ui/components/toast";
import { ToggleGroup, ToggleGroupItem } from "@velachess/ui/components/toggle-group";
import { FileText } from "@velachess/ui/icons";

import { useImportPgn } from "./queries.ts";
import {
  buildPgnImportFormSchema,
  type ParticipationMode,
  type Translate,
} from "./validation.ts";

const COPY = {
  action: msg`Import PGN`,
  title: msg`Import games from a PGN`,
  description: msg`Paste a PGN or pick a file. Your games join the same library — nothing is connected and nothing syncs.`,
  participation: msg`How you played`,
  participationHint: msg`White or Black applies to every game in this upload.`,
  participationRequired: msg`Choose how you played before importing.`,
  white: msg`White`,
  black: msg`Black`,
  byName: msg`By name`,
  playerName: msg`Your name in these games`,
  playerNameHint: msg`As it appears in the White and Black headers`,
  playerRequired: msg`Enter your name so your games can be told apart from your opponents'.`,
  file: msg`PGN file`,
  paste: msg`Or paste the moves`,
  pastePlaceholder: msg`[Event "..."] …`,
  pgnRequired: msg`There is nothing to import yet.`,
  pgnInvalid: msg`Invalid PGN: no valid chess moves found.`,
  fileReadFailed: msg`Couldn't read that file. Try again.`,
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

interface FormValues {
  pgn: string;
  participationMode: ParticipationMode | undefined;
  playerName: string;
}

const DEFAULT_VALUES: FormValues = {
  pgn: "",
  participationMode: undefined,
  playerName: "",
};

/**
 * A .pgn is plain text by definition; read it into the paste field so
 * there is exactly one place the import reads from. Clears the input
 * first so picking the same file again still fires a change event.
 */
async function handlePgnFileChange(
  input: HTMLInputElement,
  setPgnValue: (value: string) => void,
  onReadFailed: () => void,
) {
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  try {
    setPgnValue(await file.text());
  } catch {
    onReadFailed();
  }
}

function ImportPgnForm({ onDone }: { onDone: () => void }) {
  const { i18n } = useLingui();
  const translate: Translate = (message) => i18n._(message);

  const importPgn = useImportPgn({
    onImported: (outcome) => {
      announce(outcome, translate);
      onDone();
    },
    onError: () => {
      toast.add({
        type: "error",
        title: translate(RESULT_COPY.failedTitle),
        description: translate(RESULT_COPY.failedDescription),
      });
    },
  });

  const formSchema = buildPgnImportFormSchema(translate, COPY);

  const form = useForm({
    defaultValues: DEFAULT_VALUES,
    validators: {
      // onMount is deliberate, not an oversight: Import must start disabled
      // before any interaction (participationMode starts unset), not just
      // after a failed submit attempt.
      onMount: formSchema,
      onChange: formSchema,
    },
    onSubmit: async ({ value }) => {
      // onSubmit's `value` is the raw field shape, not the schema's
      // `.transform()` output (@tanstack/form-core@1.33.5) — this parse is
      // what actually produces `{ pgn, participation }`.
      const { pgn, participation } = formSchema.parse(value);

      try {
        await importPgn.mutateAsync({ pgn, participation });
      } catch {
        // The mutation already holds the failure and onError reports it;
        // rethrowing here would leave the rejection unhandled.
        return;
      }
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      {/* How you played — White/Black apply to the whole batch, By name matches per game. */}
      <FieldSet>
        <FieldLegend>{translate(COPY.participation)}</FieldLegend>
        <form.Field name="participationMode">
          {(field) => {
            // Not gated on isTouched like the other fields: the toggle
            // group never fires blur, so a required-but-unset selection
            // would otherwise never explain why Import stays disabled.
            const isInvalid = !field.state.meta.isValid;

            return (
              <>
                <ToggleGroup<ParticipationMode>
                  value={field.state.value ? [field.state.value] : []}
                  variant="outline"
                  onValueChange={(next) => field.handleChange(next[0])}
                >
                  <ToggleGroupItem value="white" disabled={importPgn.isPending}>
                    {translate(COPY.white)}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="black" disabled={importPgn.isPending}>
                    {translate(COPY.black)}
                  </ToggleGroupItem>
                  <ToggleGroupItem value="byName" disabled={importPgn.isPending}>
                    {translate(COPY.byName)}
                  </ToggleGroupItem>
                </ToggleGroup>
                {isInvalid && <FieldError errors={field.state.meta.errors} />}
              </>
            );
          }}
        </form.Field>
        <FieldDescription>{translate(COPY.participationHint)}</FieldDescription>
      </FieldSet>

      <form.Subscribe selector={(state) => state.values.participationMode}>
        {(mode) =>
          mode === "byName" && (
            <form.Field name="playerName">
              {(field) => {
                const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      {translate(COPY.playerName)}
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      aria-label={translate(COPY.playerName)}
                      aria-invalid={isInvalid}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      disabled={importPgn.isPending}
                    />
                    <FieldDescription>{translate(COPY.playerNameHint)}</FieldDescription>
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                  </Field>
                );
              }}
            </form.Field>
          )
        }
      </form.Subscribe>

      {/* The PGN source — a file or a paste, sharing the same field. */}
      <form.Field name="pgn">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="pgn-file">{translate(COPY.file)}</FieldLabel>
              <Input
                id="pgn-file"
                type="file"
                accept=".pgn,text/plain"
                aria-label={translate(COPY.file)}
                onChange={(event) =>
                  void handlePgnFileChange(event.currentTarget, field.handleChange, () =>
                    toast.add({
                      type: "error",
                      title: translate(COPY.fileReadFailed),
                    }),
                  )
                }
                disabled={importPgn.isPending}
              />

              <FieldLabel htmlFor={field.name}>{translate(COPY.paste)}</FieldLabel>
              <Textarea
                id={field.name}
                name={field.name}
                rows={6}
                value={field.state.value}
                placeholder={translate(COPY.pastePlaceholder)}
                aria-invalid={isInvalid}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                disabled={importPgn.isPending}
                className="font-mono text-xs"
              />
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          );
        }}
      </form.Field>

      {/* Import — one submit button, gated on the whole schema's validity. */}
      <div className="flex justify-end">
        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) => (
            <Button type="submit" disabled={importPgn.isPending || !canSubmit}>
              {importPgn.isPending ? translate(COPY.importing) : translate(COPY.submit)}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

/** The receipt names every pile: what landed, what was already there, what couldn't be read. */
function announce(
  outcome: { duplicates: number; rejected: number },
  translate: (message: MessageDescriptor) => string,
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
