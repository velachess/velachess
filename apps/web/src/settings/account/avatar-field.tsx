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

/** One list, so the picker and the refusal cannot disagree. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * A decode ceiling, not a payload one: the crop's re-encode bounds the
 * upload anyway. This refuses the 50 MP case that would lock the tab up in
 * `loadImage`.
 */
const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

/**
 * `accept` on the input is a hint, not a gate: it filters the picker's
 * default view, which a person can switch, and a drop bypasses it, so the
 * type check here is the real one.
 */
const buildFileSchema = (translate: (message: MessageDescriptor) => string) =>
  z
    .instanceof(File)
    .refine(
      (file) => ACCEPTED.some((type) => type === file.type),
      translate(AVATAR_COPY.wrongType),
    )
    .refine((file) => file.size <= MAX_SOURCE_BYTES, translate(AVATAR_COPY.tooLarge));

/** Under the API's own ceiling, so the crop's quality stepping settles the
 * size rather than the server refusing it. */
const MAX_ENCODED_BYTES = 120 * 1024;

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
   * An object URL pins its File until revoked, and a close handler alone
   * leaks twice: picking a second file replaces `source` without closing,
   * and navigating away unmounts without closing.
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

  /**
   * Priority order rather than four independent conditions: two can be true
   * at once, and stacked messages change the block's height.
   */
  function currentFeedback(): {
    tone: "success" | "warning" | "error";
    text: string;
  } | null {
    if (refusal !== null) return { tone: "warning", text: refusal };
    if (remove.isError) return { tone: "error", text: i18n._(AVATAR_COPY.removeFailed) };
    if (save.isSuccess) return { tone: "success", text: i18n._(AVATAR_COPY.saved) };
    if (remove.isSuccess) return { tone: "success", text: i18n._(AVATAR_COPY.removed) };
    return null;
  }

  const feedback = currentFeedback();

  async function submit() {
    if (!cropped) return;
    try {
      await save.mutateAsync(cropped);
      closeDialog();
    } catch {
      // The mutation holds the error and the dialog renders it. Branching
      // on `save.isError` would read the previous render and close on
      // failure.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex max-w-sm items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                aria-label={i18n._(AVATAR_COPY.open)}
                className="group relative cursor-pointer rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
            }
          >
            {/*
              56px, larger than anywhere else in the app, because here the
              avatar is the subject rather than a label. No `size` prop:
              `lg` sets its height through a `data-[size=lg]:` variant that
              a plain utility cannot reliably override, while the default's
              bare `size-8` merges cleanly.
            */}
            <UserAvatar user={user} className="size-14" />
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
              className="absolute right-0 bottom-0 flex size-5 items-center justify-center rounded-full border border-background bg-muted text-muted-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground group-aria-expanded:bg-primary group-aria-expanded:text-primary-foreground"
            >
              <Camera className="size-3" />
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

      {/*
        Always rendered, so a message arriving or timing out never moves the
        form beneath it. `min-h-6` clears one line of `text-sm
        leading-normal`; without it the block collapses to nothing and the
        page jumps twice per upload.
      */}
      <div className="min-h-6">
        {feedback?.tone === "success" && (
          <FieldDescription className="text-success">{feedback.text}</FieldDescription>
        )}
        {feedback?.tone === "warning" && (
          <FieldError className="text-warning">{feedback.text}</FieldError>
        )}
        {feedback?.tone === "error" && <FieldError>{feedback.text}</FieldError>}
      </div>

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
