import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";

import { Alert, AlertDescription } from "@velachess/ui/components/alert";
import { Button } from "@velachess/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@velachess/ui/components/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@velachess/ui/components/field";
import { Input } from "@velachess/ui/components/input";
import { Tabs, TabsList, TabsTrigger } from "@velachess/ui/components/tabs";

import { useImportGames, type ImportRequest } from "./queries.ts";
import { useSourceStore } from "./source-store.ts";
import {
  IMPORT_COPY,
  IMPORT_SOURCES,
  INPUT_KINDS,
  SOURCE_ORDER,
  type ImportSource,
  type SourceId,
  type Translate,
} from "./sources.ts";

const FIELD_NAME = "value" as const;

export interface ImportGamesProps {
  /** Where to land once the games are in. Ignored when `onImported` is given. */
  redirectTo?: string;
  /** Called instead of navigating — for callers that already own the frame
   * this sits in, like the onboarding dialog. */
  onImported?: () => void;
  /** `bare` drops the card, for a caller whose container is the heading. */
  chrome?: "card" | "bare";
}

export function ImportGames({
  redirectTo = "/games",
  onImported,
  chrome = "card",
}: ImportGamesProps = {}) {
  const sourceId = useSourceStore((state) => state.sourceId);
  const selectSource = useSourceStore((state) => state.selectSource);
  const importGames = useImportGames();
  const navigate = useNavigate();
  const { i18n } = useLingui();
  const translate: Translate = (message) => i18n._(message);

  const source: ImportSource = IMPORT_SOURCES[sourceId];

  const form = useForm({
    defaultValues: { [FIELD_NAME]: "" },
    onSubmit: async ({ value }) => {
      const request = buildRequest(source, value[FIELD_NAME].trim());
      if (!request) return;

      try {
        await importGames.mutateAsync(request);
      } catch {
        // The mutation already holds the failure and the field below renders it;
        // rethrowing here would leave the rejection unhandled.
        return;
      }

      // The mutation already awaited its cache invalidation, so whatever
      // happens next — dialog close or navigate — sees fresh data, not a stale frame.
      if (onImported) {
        onImported();
        return;
      }
      await navigate({ to: redirectTo });
    },
  });

  const body = (
    <>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Tabs
          value={sourceId}
          onValueChange={(next) => {
            selectSource(next as SourceId);
            form.reset();
          }}
        >
          <TabsList className="w-full">
            {SOURCE_ORDER.map((id) => {
              const Icon = IMPORT_SOURCES[id].icon;
              return (
                <TabsTrigger key={id} value={id}>
                  <Icon data-icon="inline-start" />
                  {IMPORT_SOURCES[id].label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <FieldGroup>
          <form.Field
            name={FIELD_NAME}
            validators={{ onSubmit: source.buildSchema(translate) }}
          >
            {(field) => {
              const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

              return (
                <Field data-invalid={isInvalid}>
                  <FieldLabel className="sr-only" htmlFor={field.name}>
                    {i18n._(source.inputLabel)}
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      id={field.name}
                      name={field.name}
                      aria-invalid={isInvalid}
                      placeholder={i18n._(source.inputLabel)}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      disabled={importGames.isPending}
                    />
                    <form.Subscribe selector={(state) => state.isSubmitting}>
                      {(isSubmitting) => (
                        <Button
                          type="submit"
                          disabled={isSubmitting || importGames.isPending}
                        >
                          <SubmitLabel
                            isSubmitting={isSubmitting}
                            isImporting={importGames.isPending}
                          />
                        </Button>
                      )}
                    </form.Subscribe>
                  </div>

                  <FieldError errors={field.state.meta.errors} />
                </Field>
              );
            }}
          </form.Field>
        </FieldGroup>

        <ImportStatus isSuccess={importGames.isSuccess} isError={importGames.isError} />
      </form>
    </>
  );

  if (chrome === "bare") return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{i18n._(IMPORT_COPY.title)}</CardTitle>
        <CardDescription>{i18n._(IMPORT_COPY.description)}</CardDescription>
      </CardHeader>

      <CardContent>{body}</CardContent>
    </Card>
  );
}

function SubmitLabel({
  isSubmitting,
  isImporting,
}: {
  isSubmitting: boolean;
  isImporting: boolean;
}) {
  const { i18n } = useLingui();

  if (isSubmitting || isImporting) return i18n._(IMPORT_COPY.submitting);
  return i18n._(IMPORT_COPY.submit);
}

function ImportStatus({ isSuccess, isError }: { isSuccess: boolean; isError: boolean }) {
  const { i18n } = useLingui();

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{i18n._(IMPORT_COPY.failed)}</AlertDescription>
      </Alert>
    );
  }

  if (isSuccess) {
    return (
      <Alert>
        <AlertDescription>{i18n._(IMPORT_COPY.running)}</AlertDescription>
      </Alert>
    );
  }

  return null;
}

function buildRequest(source: ImportSource, value: string): ImportRequest | null {
  if (!value) return null;

  switch (source.inputKind) {
    case INPUT_KINDS.username:
      return { kind: INPUT_KINDS.username, source: source.id, username: value };
    default:
      return null;
  }
}
