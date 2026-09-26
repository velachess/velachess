import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useState } from "react";

import { Button, buttonVariants } from "@velachess/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@velachess/ui/components/dialog";
import { FieldDescription, FieldError } from "@velachess/ui/components/field";
import { ImageCropper } from "@velachess/ui/components/image-cropper";
import { Pencil } from "@velachess/ui/icons";
import { Spinner } from "@velachess/ui/components/spinner";

import { useRemoveAvatar, useSetAvatar } from "./queries.ts";
import type { SessionUser } from "../../auth/client.ts";
import { UserAvatar } from "../../auth/user-avatar.tsx";

const AVATAR_COPY = {
  change: msg`Change your picture`,
  remove: msg`Remove picture`,
  dialogTitle: msg`Crop your picture`,
  dialogDescription: msg`Drag to reposition, and zoom to fill the circle.`,
  zoom: msg`Zoom`,
  cancel: msg`Cancel`,
  save: msg`Save picture`,
  saving: msg`Saving…`,
  saved: msg`Picture updated.`,
  removed: msg`Picture removed.`,
  saveFailed: msg`Couldn't save that picture. Try again.`,
  removeFailed: msg`Couldn't remove it. Try again.`,
  wrongType: msg`Choose a JPEG, PNG or WebP image.`,
  tooLarge: msg`That image is too large. Choose one under 8 MB.`,
} as const;

/** What the file input offers, and what a picked file is checked against —
 * one list, so the dialog and the refusal cannot disagree. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * A decode ceiling, not a payload one: the upload is bounded by the crop's
 * re-encode regardless. An 8 MP phone photo is ~4 MB, so this refuses the
 * 50 MP case that would lock the tab up in `loadImage` before the user
 * learns anything.
 */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/** Kept under the API's own ceiling so the crop's quality stepping settles
 * the size here rather than the server refusing it. */
const MAX_ENCODED_BYTES = 120 * 1024;

/** Stable, because the label points at it by id. */
const FILE_INPUT_ID = "avatar-file";

type Refusal = "wrong-type" | "too-large";

export function AvatarField({ user }: { user: SessionUser }) {
  const { i18n } = useLingui();
  const [source, setSource] = useState<string | null>(null);
  const [cropped, setCropped] = useState<Blob | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  const save = useSetAvatar();
  const remove = useRemoveAvatar();

  function closeDialog() {
    // The object URL is ours to release; the cropper only reads it.
    if (source) URL.revokeObjectURL(source);
    setSource(null);
    setCropped(null);
  }

  function pick(file: File | undefined) {
    if (!file) return;

    // Both refusals happen before any decode, so a wrong file costs nothing
    // and the message arrives immediately.
    if (!ACCEPTED.includes(file.type as (typeof ACCEPTED)[number])) {
      setRefusal("wrong-type");
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setRefusal("too-large");
      return;
    }

    setRefusal(null);
    save.reset();
    remove.reset();
    setSource(URL.createObjectURL(file));
  }

  async function submit() {
    if (!cropped) return;
    try {
      await save.mutateAsync(cropped);
      closeDialog();
    } catch {
      // Held by the mutation and rendered in the dialog; rethrowing would
      // be an unhandled rejection. Branching on `save.isError` instead
      // would read the previous render's value and close on failure.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <div className="relative">
          <UserAvatar user={user} size="lg" />
          {/*
            A real label, not a button that clicks a hidden input: the
            label's text *is* the input's accessible name, so there is one
            control with one name rather than two competing for it, and
            activating it opens the picker with no script. Styled through
            `buttonVariants` rather than rendered as a Button, so the text
            stays the label's own child — which both screen readers and the
            a11y lint rule can see.
          */}
          <label
            htmlFor={FILE_INPUT_ID}
            className={buttonVariants({
              variant: "secondary",
              size: "icon-xs",
              className: "absolute -bottom-1 -right-1 rounded-full shadow-sm",
            })}
          >
            <Pencil />
            <span className="sr-only">{i18n._(AVATAR_COPY.change)}</span>
          </label>
          <input
            id={FILE_INPUT_ID}
            type="file"
            className="sr-only"
            accept={ACCEPTED.join(",")}
            onChange={(event) => {
              pick(event.target.files?.[0]);
              // Cleared so picking the same file twice still fires change.
              event.target.value = "";
            }}
          />
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>

        {user.image && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            disabled={remove.isPending}
            onClick={() => {
              setRefusal(null);
              save.reset();
              remove.mutate();
            }}
          >
            {i18n._(AVATAR_COPY.remove)}
          </Button>
        )}
      </div>

      {refusal === "wrong-type" && (
        <FieldError>{i18n._(AVATAR_COPY.wrongType)}</FieldError>
      )}
      {refusal === "too-large" && <FieldError>{i18n._(AVATAR_COPY.tooLarge)}</FieldError>}
      {save.isSuccess && <FieldDescription>{i18n._(AVATAR_COPY.saved)}</FieldDescription>}
      {remove.isSuccess && (
        <FieldDescription>{i18n._(AVATAR_COPY.removed)}</FieldDescription>
      )}
      {remove.isError && <FieldError>{i18n._(AVATAR_COPY.removeFailed)}</FieldError>}

      <Dialog
        open={source !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{i18n._(AVATAR_COPY.dialogTitle)}</DialogTitle>
            <DialogDescription>{i18n._(AVATAR_COPY.dialogDescription)}</DialogDescription>
          </DialogHeader>

          {source && (
            <ImageCropper
              src={source}
              maxBytes={MAX_ENCODED_BYTES}
              zoomLabel={i18n._(AVATAR_COPY.zoom)}
              onCropped={setCropped}
            />
          )}

          {save.isError && <FieldError>{i18n._(AVATAR_COPY.saveFailed)}</FieldError>}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={save.isPending}>
              {i18n._(AVATAR_COPY.cancel)}
            </Button>
            <Button
              onClick={() => void submit()}
              disabled={save.isPending || cropped === null}
            >
              {save.isPending && <Spinner aria-hidden="true" />}
              {i18n._(save.isPending ? AVATAR_COPY.saving : AVATAR_COPY.save)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
