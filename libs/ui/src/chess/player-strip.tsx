/**
 * [UI] Who is sitting on one side of the board.
 */

import { Avatar, AvatarFallback, AvatarImage } from "../components/avatar.tsx";
import { cn } from "../lib/utils.ts";
import { countryNameOf } from "./country-names.ts";

const INITIALS_MAX = 2;
const WHITESPACE = /\s+/;
const FIRST_LETTER = 1;

/**
 * Code points, not code units. Chess usernames carry emoji often enough
 * that `"🐴rider".slice(0, 2)` matters — it cuts a surrogate pair in half
 * and renders as a replacement character.
 */
function firstCharacters(text: string, count: number): string {
  return [...text].slice(0, count).join("");
}

/** "Yuri Mutti" → "YM" — one letter from each of the first two words. */
function initialsFromWords(words: string[]): string {
  return words
    .slice(0, INITIALS_MAX)
    .map((word) => firstCharacters(word, FIRST_LETTER))
    .join("");
}

/** "kalipere" → "KA" — a single word has no second word to borrow from. */
function initialsFromOneWord(word: string): string {
  return firstCharacters(word, INITIALS_MAX);
}

/**
 * The two or so letters that stand in for a missing avatar.
 *
 * Two rules, not one: a name with parts is an acronym of them, and a
 * single word — which most chess usernames are — is its own opening.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(WHITESPACE).filter(Boolean);
  if (words.length === 0) return "";

  const isMultiWord = words.length > 1;
  const initials = isMultiWord
    ? initialsFromWords(words)
    : initialsFromOneWord(words[0]!);

  return initials.toUpperCase();
}

/**
 * `flag-icons` names its classes after the lowercase ISO 3166-1 alpha-2
 * code, and ships `xx` for "no flag" — so an unrecognised code lands on a
 * blank rather than on a missing background and a broken box.
 */
const FLAG_UNKNOWN = "xx";
const ISO_ALPHA2 = /^[A-Za-z]{2}$/;

export function flagClassOf(countryCode: string | undefined): string {
  const code = ISO_ALPHA2.test(countryCode ?? "")
    ? countryCode!.toLowerCase()
    : FLAG_UNKNOWN;
  return `fi fi-${code}`;
}

export interface PlayerStripProps {
  name: string;
  /** Already formatted, because number formatting is locale work and
   * this package has no locale. Absent when the rating is unknown. */
  rating?: string | undefined;
  /** Photo URL. Falls back to initials when absent or failing to load. */
  avatarSrc?: string;
  /** ISO 3166-1 alpha-2, as both platforms report it. The name behind it
   * is resolved here, so a caller never carries the two out of step. */
  countryCode?: string;
  className?: string;
}

export function PlayerStrip({
  name,
  rating,
  avatarSrc,
  countryCode,
  className,
}: PlayerStripProps) {
  const countryName = countryNameOf(countryCode);
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <Avatar size="sm">
        {avatarSrc ? <AvatarImage src={avatarSrc} alt="" /> : null}
        <AvatarFallback aria-hidden className="text-xs font-medium">
          {initialsOf(name)}
        </AvatarFallback>
      </Avatar>

      {countryCode ? (
        <span
          className={cn(flagClassOf(countryCode), "shrink-0 rounded-[2px] text-sm")}
          // A flag with no name is decoration; with one it is information.
          {...(countryName
            ? { role: "img", "aria-label": countryName }
            : { "aria-hidden": true })}
        />
      ) : null}

      <span className="truncate text-sm font-medium">{name}</span>

      {rating ? (
        // Parenthesised the way both platforms print it, so the number
        // reads as an aside rather than as part of the name.
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          ({rating})
        </span>
      ) : null}
    </div>
  );
}
