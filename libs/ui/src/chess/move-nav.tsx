/**
 * [UI/chess] Stepping through a position, once.
 *
 * Game Review walks a scoresheet and Repertoire Study walks a variation
 * tree, but "back one, forward one, start again" is the same gesture in
 * both, and a second implementation of it is a second set of keyboard
 * hints, hit areas and disabled rules to keep in sync. What differs is
 * only what a step *means*, which is the caller's business — this owns
 * the buttons and nothing else.
 *
 * 44px tall on touch, smaller on pointer: the thumb needs the height.
 * Copy arrives translated, like every other string in this package.
 */
import { Button } from "../components/button.tsx";
import { Kbd } from "../components/kbd.tsx";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "../components/pagination.tsx";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/tooltip.tsx";
// Icons stay behind the UI package's single entry point so replacing Lucide does not leak here.
// react-doctor-disable-next-line react-doctor/no-barrel-import
import { ArrowLeft, ArrowRight, RotateCcw } from "../icons/index.ts";
import { cn } from "../lib/utils.ts";

export interface MoveNavCopy {
  /** Accessible name of the whole group. */
  navigation: string;
  previous: string;
  next: string;
  /** Abbreviations shown on the buttons; the full words are the labels. */
  previousShort: string;
  nextShort: string;
  /** Only read when `onReset` is given. */
  reset?: string;
}

export interface MoveNavProps {
  copy: MoveNavCopy;
  canGoBack: boolean;
  canGoForward: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** Back to the starting position. Omitted where there is nothing to
   * return to that "previous" does not already reach. */
  onReset?: () => void;
  className?: string;
}

export function MoveNav({
  copy,
  canGoBack,
  canGoForward,
  onPrevious,
  onNext,
  onReset,
  className,
}: MoveNavProps) {
  return (
    <Pagination aria-label={copy.navigation} className={cn("shrink-0 p-3", className)}>
      <PaginationContent className="w-full gap-2">
        {onReset && copy.reset && (
          <PaginationItem>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="outline"
                    className="h-11 md:h-9"
                    disabled={!canGoBack}
                    aria-label={copy.reset}
                    onClick={onReset}
                  >
                    <RotateCcw />
                  </Button>
                }
              />
              <TooltipContent>{copy.reset}</TooltipContent>
            </Tooltip>
          </PaginationItem>
        )}
        <PaginationItem className="flex-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  className="h-11 w-full md:h-9"
                  disabled={!canGoBack}
                  aria-label={copy.previous}
                  onClick={onPrevious}
                >
                  <ArrowLeft data-icon="inline-start" />
                  <span className="text-xs">{copy.previousShort}</span>
                </Button>
              }
            />
            <TooltipContent>
              {copy.previous}
              <Kbd>←</Kbd>
            </TooltipContent>
          </Tooltip>
        </PaginationItem>
        <PaginationItem className="flex-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="outline"
                  className="h-11 w-full md:h-9"
                  disabled={!canGoForward}
                  aria-label={copy.next}
                  onClick={onNext}
                >
                  <span className="text-xs">{copy.nextShort}</span>
                  <ArrowRight data-icon="inline-end" />
                </Button>
              }
            />
            <TooltipContent>
              {copy.next}
              <Kbd>→</Kbd>
            </TooltipContent>
          </Tooltip>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
