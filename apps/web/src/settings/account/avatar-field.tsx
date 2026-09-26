import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@velachess/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@velachess/ui/components/dropdown-menu";
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
import { Camera, Trash2 } from "@velachess/ui/icons";
import { Spinner } from "@velachess/ui/components/spinner";

import { useRemoveAvatar, useSetAvatar } from "./queries.ts";
import { useTransientSuccess } from "./use-transient-success.ts";
import type { SessionUser } from "../../auth/client.ts";
import { UserAvatar } from "../../auth/user-avatar.tsx";
import { z } from "../../libs/zod.ts";

const AVATAR_COPY = {
  open: msg`Change your picture`,
  change: msg`Change picture`,
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
 * one list, so the picker and the refusal cannot disagree. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * A decode ceiling, not a payload one: the upload is bounded by the crop's
 * re-encode regardless. An 8 MP phone photo is ~4 MB, so this refuses the
 * 50 MP case that would lock the tab up in `loadImage` before the user
 * learns anything.
 */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/**
 * The picked file's own rules, with their messages, in one place — the
 * shape `games/import/sources.ts` uses for the same reason: a refusal and
 * the text explaining it should not be able to drift apart.
 *
 * `accept` on the input is a hint, not a gate. It filters the picker's
 * default view, a person can switch it to all files, and a drag-and-drop
 * bypasses it entirely, so the type check here is the real one.
 */
const buildFileSchema = (translate: (message: MessageDescriptor) => string) =>
  z
    .instanceof(File)
    .refine(
      (file) => ACCEPTED.includes(file.type as (typeof ACCEPTED)[number]),
      translate(AVATAR_COPY.wrongType),
    )
    .refine((file) => file.size <= MAX_SOURCE_BYTES, translate(AVATAR_COPY.tooLarge));

/** Kept under the API's own ceiling so the crop's quality stepping settles
 * the size here rather than the server refusing it. */
const MAX_ENCODED_BYTES = 120 * 1024;

/** Stable, because the label points at it by id. */
const FILE_INPUT_ID = "avatar-file";

export function AvatarField({ user }: { user: SessionUser }) {
  const { i18n } = useLingui();
  const fileInput = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<string | null>(null);
  const [cropped, setCropped] = useState<Blob | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const save = useSetAvatar();
  const remove = useRemoveAvatar();
  useTransientSuccess(save.isSuccess, save.reset);
  useTransientSuccess(remove.isSuccess, remove.reset);

  /**
   * An object URL pins its File in memory until revoked, so the revoke is
   * tied to the URL's own lifetime rather than to one exit path. Revoking
   * in a close handler alone leaks twice: picking a second file replaces
   * `source` without closing, and navigating away unmounts without
   * closing. Cleanup runs with the previous value in both cases.
   */
  useEffect(() => {
    if (source === null) return;
    return () => URL.revokeObjectURL(source);
  }, [source]);

  function closeDialog() {
    setSource(null);
    setCropped(null);
  }

  function pick(file: File | undefined) {
    if (!file) return;

    // Checked before any decode, so a wrong file costs nothing and the
    // message arrives immediately.
    const checked = buildFileSchema((message) => i18n._(message)).safeParse(file);
    if (!checked.success) {
      setRefusal(checked.error.issues[0]?.message ?? null);
      return;
    }

    setRefusal(null);
    save.reset();
    remove.reset();
    setSource(URL.createObjectURL(checked.data));
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
      <div className="flex max-w-sm items-center gap-3">
        {/*
          The whole avatar is the control, with the overlay as the hint
          rather than a second target beside it. The actions live in a menu
          because there are two of them and one is destructive — a bare
          click would have to guess which.
        */}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={i18n._(AVATAR_COPY.open)}
                className="group relative rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            }
          >
            <UserAvatar user={user} size="lg" />
            {/*
              The badge is always there, because an affordance that only
              appears on hover tells a touch user nothing — they would have
              to guess the avatar is a control. The dim is the hover
              response on top of it.
            */}
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-foreground/0 transition-colors group-hover:bg-foreground/20 group-aria-expanded:bg-foreground/20"
            />
            <span
              aria-hidden="true"
              className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full border border-background bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground group-aria-expanded:bg-primary group-aria-expanded:text-primary-foreground"
            >
              <Camera className="size-2.5" />
            </span>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => fileInput.current?.click()}>
              <Camera />
              {i18n._(AVATAR_COPY.change)}
            </DropdownMenuItem>

            {user.image && (
              <DropdownMenuItem
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => {
                  setRefusal(null);
                  save.reset();
                  remove.mutate();
                }}
              >
                <Trash2 />
                {i18n._(AVATAR_COPY.remove)}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Never focused and never the affordance — the menu item is. It
            stays reachable by label so a test can attach a file to it. */}
        <input
          ref={fileInput}
          id={FILE_INPUT_ID}
          type="file"
          tabIndex={-1}
          className="sr-only"
          accept={ACCEPTED.join(",")}
          aria-label={i18n._(AVATAR_COPY.change)}
          onChange={(event) => {
            pick(event.target.files?.[0]);
            // Cleared so picking the same file twice still fires change.
            event.target.value = "";
          }}
        />

        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>

      {refusal !== null && <FieldError>{refusal}</FieldError>}
      {/* Transient, like the form's: the avatar persisted the moment it
          changed, so a message that lingers would read as pending state. */}
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
