import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useState } from "react";

import { Button } from "@velachess/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@velachess/ui/components/dialog";
import { Spinner } from "@velachess/ui/components/spinner";
import { ArrowRightIcon } from "@velachess/ui/icons";
import { cn } from "@velachess/ui/lib/utils";

import { ONBOARDING_STEPS, StepMedia } from "./steps.tsx";
import { ImportGames } from "../games/import/import-games.tsx";
import { IMPORT_MUTATION_KEY } from "../games/import/queries.ts";
import { useIsMutating } from "../libs/react-query.ts";

const DIALOG_COPY = {
  skip: msg`Skip`,
  next: msg`Next`,
  back: msg`Back`,
  connect: msg`Connect an account`,
  connectDescription: msg`Your handle is all it takes. We read the public archive and stop there.`,
  syncingTitle: msg`Reading your games`,
  syncingDescription: msg`This takes a moment. The app opens as soon as they land.`,
} as const;

/**
 * The tour, ending in the import that lets the app open.
 *
 * There is no way out: nothing opened it, no close button ends it, the
 * backdrop is inert and Escape does nothing. That is the point — the
 * screens behind it are empty until this finishes, and dismissing it
 * would only hide that. It disappears when the games arrive, because the
 * condition that mounts it stops being true.
 */
export function OnboardingDialog({ syncing }: { syncing: boolean }) {
  const { i18n } = useLingui();
  const [step, setStep] = useState(0);
  const importing = useIsMutating({ mutationKey: IMPORT_MUTATION_KEY }) > 0;

  const importStep = ONBOARDING_STEPS.length;
  const current = ONBOARDING_STEPS[step];

  return (
    <Dialog open disablePointerDismissal>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-xl"
        onKeyDown={(event) => {
          // Base UI closes on Escape by default. Nothing here is
          // dismissible, so the key is swallowed rather than left to
          // half-work.
          if (event.key === "Escape") event.preventDefault();
        }}
      >
        {/* Three slides, exclusive by construction: syncing wins, then a
            tour step if there is one, and the import when the steps run
            out. Each condition says which of the three it is. */}
        {syncing && <SyncingSlide />}

        {!syncing && current !== undefined && (
          <div className="flex flex-col gap-4">
            <StepMedia icon={current.icon} />
            <div className="flex flex-col gap-2 text-center">
              <DialogTitle className="text-xl">{i18n._(current.title)}</DialogTitle>
              <DialogDescription>{i18n._(current.description)}</DialogDescription>
            </div>
          </div>
        )}

        {!syncing && current === undefined && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 text-center">
              <DialogTitle className="text-xl">{i18n._(DIALOG_COPY.connect)}</DialogTitle>
              <DialogDescription>
                {i18n._(DIALOG_COPY.connectDescription)}
              </DialogDescription>
            </div>
            {/* Nothing to navigate to on success: the app is already
                behind this, and the mutation awaited the caches it
                invalidated — so the screen underneath is filled in by the
                time the overlay's condition goes false and it unmounts. */}
            <ImportGames chrome="bare" onImported={() => setStep(importStep)} />
          </div>
        )}

        {!syncing && (
          <div className="flex items-center justify-between">
            <div className="flex gap-2" aria-hidden>
              {[...ONBOARDING_STEPS, { id: "import" }].map((entry, index) => (
                <span
                  key={entry.id}
                  className={cn(
                    "size-2 rounded-full transition-colors",
                    index === step ? "bg-foreground" : "bg-muted",
                  )}
                />
              ))}
            </div>

            {step === importStep && (
              <Button
                variant="ghost"
                disabled={importing}
                onClick={() => setStep(step - 1)}
              >
                {i18n._(DIALOG_COPY.back)}
              </Button>
            )}

            {step !== importStep && (
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setStep(importStep)}>
                  {i18n._(DIALOG_COPY.skip)}
                </Button>
                <Button onClick={() => setStep(step + 1)}>
                  {i18n._(DIALOG_COPY.next)}
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A pass is on its way; asking for another handle would be noise. */
function SyncingSlide() {
  const { i18n } = useLingui();

  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <Spinner className="size-6" />
      <div className="flex flex-col gap-2">
        <DialogTitle className="text-xl">{i18n._(DIALOG_COPY.syncingTitle)}</DialogTitle>
        <DialogDescription>{i18n._(DIALOG_COPY.syncingDescription)}</DialogDescription>
      </div>
    </div>
  );
}
