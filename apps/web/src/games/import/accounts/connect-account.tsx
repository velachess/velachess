import { useLingui } from "@lingui/react";
import { useForm } from "@tanstack/react-form";
import { useNavigate } from "@tanstack/react-router";
import { useId } from "react";

import { Alert, AlertDescription, AlertTitle } from "@velachess/ui/components/alert";
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
import { CircleCheckIcon, InfoIcon, OctagonXIcon } from "@velachess/ui/icons";

import { DetailedError, isProviderAlreadyConnectedError } from "../../../api/index.ts";
import { GAME_SOURCES } from "../../game-sources.ts";
import { SourceMark } from "../../source-mark.tsx";
import { useQuery } from "../../../libs/react-query.ts";
import { trackedAccountsQuery, useImportGames, type ImportRequest } from "./queries.ts";
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

export interface ConnectAccountProps {
  /** Ignored when `onImported` is given. */
  redirectTo?: string;
  /** Called instead of navigating, for a caller that already owns the frame
   * this sits in. */
  onImported?: () => void;
  /** `bare` drops the card, for a caller whose container is the heading. */
  chrome?: "card" | "bare";
  /** Pins the form to one provider and drops the picker. */
  source?: SourceId;
}

export function ConnectAccount({
  redirectTo = "/games",
  onImported,
  chrome = "card",
  source: pinnedSourceId,
}: ConnectAccountProps = {}) {
  const pickedSourceId = useSourceStore((state) => state.sourceId);
  const sourceId = pinnedSourceId ?? pickedSourceId;
  const selectSource = useSourceStore((state) => state.selectSource);
  const importGames = useImportGames();
  const accounts = useQuery(trackedAccountsQuery);
  const navigate = useNavigate();
  const { i18n } = useLingui();
  const translate: Translate = (message) => i18n._(message);

  const source: ImportSource = IMPORT_SOURCES[sourceId];
  const sourceName = GAME_SOURCES[sourceId].label;

  // One account per provider: a tracked platform, or a 409 from a race,
  // replaces the form with a note naming the handle that holds the slot.
  const connectedHandle: string | undefined =
    accounts.data?.find((account) => account.platform === sourceId)?.username ??
    (isProviderAlreadyConnectedError(importGames.error) &&
    importGames.error.platform === sourceId
      ? importGames.error.username
      : undefined);

  const form = useForm({
    defaultValues: { [FIELD_NAME]: "" },
    onSubmit: async ({ value }) => {
      const request = buildRequest(source, value[FIELD_NAME].trim());
      if (!request) return;

      try {
        await importGames.mutateAsync(request);
      } catch {
        // The mutation holds the failure and the field below renders it;
        // rethrowing leaves the rejection unhandled.
        return;
      }

      // The mutation awaited its cache invalidation, so a close or a
      // navigate sees fresh data rather than a stale frame.
      if (onImported) {
        onImported();
        return;
      }
      await navigate({ to: redirectTo });
    },
  });

  const handleSourceChange = (next: unknown) => {
    const picked = SOURCE_ORDER.find((id) => id === next);
    if (picked === undefined) return;
    selectSource(picked);
    form.reset();
  };

  const body = (
    <>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        {pinnedSourceId === undefined && (
          <Tabs value={sourceId} onValueChange={handleSourceChange}>
            <TabsList className="w-full">
              {SOURCE_ORDER.map((id) => (
                <TabsTrigger key={id} value={id}>
                  <SourceMark source={id} data-icon="inline-start" />
                  {GAME_SOURCES[id].label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        {connectedHandle !== undefined && (
          <AlreadyConnectedNotice username={connectedHandle} platform={sourceName} />
        )}

        {connectedHandle === undefined && (
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
        )}

        {connectedHandle === undefined && (
          <ImportStatus isSuccess={importGames.isSuccess} error={importGames.error} />
        )}
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

function importFailureCopy(error: Error) {
  if (error instanceof DetailedError && error.statusCode === 404) {
    return IMPORT_COPY.notFound;
  }
  return IMPORT_COPY.failed;
}

function ImportStatus({ isSuccess, error }: { isSuccess: boolean; error: Error | null }) {
  const { i18n } = useLingui();
  const titleId = useId();

  if (error) {
    return (
      <Alert variant="destructive" aria-labelledby={titleId}>
        <OctagonXIcon aria-hidden="true" />
        <AlertTitle id={titleId}>{i18n._(importFailureCopy(error))}</AlertTitle>
      </Alert>
    );
  }

  if (isSuccess) {
    return (
      <Alert variant="success">
        <CircleCheckIcon aria-hidden="true" />
        <AlertTitle>{i18n._(IMPORT_COPY.running)}</AlertTitle>
      </Alert>
    );
  }

  return null;
}

/** Info, not destructive: this is a connected platform at rest, and red
 * belongs to an import that failed. */
function AlreadyConnectedNotice({
  username,
  platform,
}: {
  username: string;
  platform: string;
}) {
  const { i18n } = useLingui();

  return (
    <Alert variant="info">
      <InfoIcon aria-hidden="true" />
      <AlertTitle>
        {i18n._({
          ...IMPORT_COPY.alreadyConnectedTitle,
          values: { platform },
        })}
      </AlertTitle>
      <AlertDescription>
        {i18n._({
          ...IMPORT_COPY.alreadyConnectedDescription,
          values: { username },
        })}
      </AlertDescription>
    </Alert>
  );
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
