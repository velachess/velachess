import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";

import { Button } from "@velachess/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Spinner } from "@velachess/ui/components/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@velachess/ui/components/tabs";
import { Textarea } from "@velachess/ui/components/textarea";
import { toast } from "@velachess/ui/components/toast";
import { ToggleGroup, ToggleGroupItem } from "@velachess/ui/components/toggle-group";
import { FileText } from "@velachess/ui/icons";

import { PgnDropzone } from "./pgn-dropzone.tsx";
import { useImportPgn } from "./queries.ts";
import {
  buildPgnImportFormSchema,
  PARTICIPATION_MODES,
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
  upload: msg`Upload file`,
  paste: msg`Paste PGN`,
  pasteLabel: msg`PGN text`,
  pastePlaceholder: msg`[Event "..."] …`,
  pgnRequired: msg`There is nothing to import yet.`,
  pgnInvalid: msg`Invalid PGN: no valid chess moves found.`,
  fileReadFailed: msg`Couldn't read that file. Try again.`,
  cancel: msg`Cancel`,
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
 * The manual source: a repeatable upload with no account row behind it and
 * nothing remembered on this device.
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
      <DialogContent
        aria-labelledby={DIALOG_TITLE_ID}
        className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pr-12 pb-5">
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
 * tanstack-form keeps field meta in the form instance, not the component,
 * so unmounting the name field leaves its error cached and ready to
 * reappear the instant "By name" is picked again.
 */
function handleParticipationModeChange(
  mode: ParticipationMode | undefined,
  field: { handleChange: (value: ParticipationMode | undefined) => void },
  form: { resetField: (name: "playerName") => void },
) {
  field.handleChange(mode);
  // Resetting on every change would run before the name field has mounted
  // for the mode just picked.
  if (mode !== PARTICIPATION_MODES.byName) form.resetField("playerName");
}

function ImportPgnForm({ onDone }: { onDone: () => void }) {
  const { i18n } = useLingui();
  const translate: Translate = (message) => i18n._(message);
  const [file, setFile] = useState<File | null>(null);

  const importPgn = useImportPgn({
    onImported: (outcome) => {
      announce(outcome, translate);
      onDone();
    },
    onError: () => {
      toast.add({
        id: "pgn-import-failed",
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
      // `onMount` so Import starts disabled before any interaction, since
      // participationMode starts unset.
      onMount: formSchema,
      onChange: formSchema,
    },
    onSubmit: async ({ value }) => {
      // onSubmit's `value` is the raw field shape, not the schema's
      // `.transform()` output (@tanstack/form-core@1.33.5), so this parse is
      // what produces `{ pgn, participation }`.
      const { pgn, participation } = formSchema.parse(value);

      try {
        await importPgn.mutateAsync({ pgn, participation });
      } catch {
        // The mutation holds the failure and onError reports it;
        // rethrowing leaves the rejection unhandled.
        return;
      }
    },
  });

  async function handlePicked(picked: File, setPgnValue: (value: string) => void) {
    try {
      const text = await picked.text();
      setPgnValue(text);
      setFile(picked);
    } catch {
      toast.add({
        id: "pgn-file-read-failed",
        type: "error",
        title: translate(COPY.fileReadFailed),
      });
    }
  }

  function handleRemoved(setPgnValue: (value: string) => void) {
    setPgnValue("");
    setFile(null);
  }

  /** Edited text no longer came from the file, so the named file would lie. */
  function handlePasted(text: string, setPgnValue: (value: string) => void) {
    setPgnValue(text);
    setFile(null);
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto border-t px-6 py-5">
        <form.Field name="pgn">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

            return (
              <Field data-invalid={isInvalid} className="gap-0">
                <Tabs defaultValue="upload" className="gap-0">
                  <TabsList className="w-full">
                    <TabsTrigger value="upload">{translate(COPY.upload)}</TabsTrigger>
                    <TabsTrigger value="paste">{translate(COPY.paste)}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="upload" className="mt-4">
                    <PgnDropzone
                      file={file}
                      onPicked={(picked) => void handlePicked(picked, field.handleChange)}
                      onRemoved={() => handleRemoved(field.handleChange)}
                      disabled={importPgn.isPending}
                      invalid={isInvalid}
                    />
                  </TabsContent>
                  <TabsContent value="paste" className="mt-4">
                    <FieldLabel className="sr-only" htmlFor={field.name}>
                      {translate(COPY.pasteLabel)}
                    </FieldLabel>
                    <Textarea
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      placeholder={translate(COPY.pastePlaceholder)}
                      aria-invalid={isInvalid}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        handlePasted(event.target.value, field.handleChange)
                      }
                      disabled={importPgn.isPending}
                      className="h-50 resize-none rounded-lg font-mono text-xs field-sizing-fixed"
                    />
                  </TabsContent>
                </Tabs>
                {/* The gap to the next section doubles as the error's line, so
                    an error costs no height and leaves no blank when absent. */}
                <div className="min-h-7 py-1">
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </div>
              </Field>
            );
          }}
        </form.Field>

        <FieldSet>
          <FieldLegend>{translate(COPY.participation)}</FieldLegend>
          <FieldDescription>{translate(COPY.participationHint)}</FieldDescription>
          <form.Field name="participationMode">
            {(field) => {
              // Gated on isTouched, which the toggle group sets on the first
              // press and handleSubmit on an attempt — blur, which it never
              // fires, would gate it forever.
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <div>
                  <ToggleGroup<ParticipationMode>
                    value={field.state.value ? [field.state.value] : []}
                    variant="outline"
                    onValueChange={(next) =>
                      handleParticipationModeChange(next[0], field, form)
                    }
                  >
                    <ToggleGroupItem
                      value={PARTICIPATION_MODES.white}
                      disabled={importPgn.isPending}
                    >
                      {translate(COPY.white)}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value={PARTICIPATION_MODES.black}
                      disabled={importPgn.isPending}
                    >
                      {translate(COPY.black)}
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value={PARTICIPATION_MODES.byName}
                      disabled={importPgn.isPending}
                    >
                      {translate(COPY.byName)}
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <div className="min-h-7 py-1">
                    {isInvalid && <FieldError errors={field.state.meta.errors} />}
                    {/* Before any answer the same sentence is a hint, not a complaint. */}
                    {!isInvalid && field.state.value === undefined && (
                      <FieldDescription>
                        {translate(COPY.participationRequired)}
                      </FieldDescription>
                    )}
                  </div>
                </div>
              );
            }}
          </form.Field>
        </FieldSet>

        <form.Subscribe selector={(state) => state.values.participationMode}>
          {(mode) =>
            mode === PARTICIPATION_MODES.byName && (
              <form.Field name="playerName">
                {(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

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
                      <FieldDescription>
                        {translate(COPY.playerNameHint)}
                      </FieldDescription>
                      <div className="min-h-7 py-1">
                        {isInvalid && <FieldError errors={field.state.meta.errors} />}
                      </div>
                    </Field>
                  );
                }}
              </form.Field>
            )
          }
        </form.Subscribe>
      </div>

      <DialogFooter className="shrink-0 border-t px-6 py-4">
        <DialogClose
          render={
            <Button variant="outline" type="button" disabled={importPgn.isPending}>
              {translate(COPY.cancel)}
            </Button>
          }
        />
        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) => (
            <Button type="submit" disabled={importPgn.isPending || !canSubmit}>
              {importPgn.isPending && (
                <Spinner aria-hidden="true" data-icon="inline-start" />
              )}
              {importPgn.isPending ? translate(COPY.importing) : translate(COPY.submit)}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
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
