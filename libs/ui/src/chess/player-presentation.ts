/**
 * [UI] What `PlayerStrip` draws beside a name. Separate from the
 * component because React Refresh — and `react-doctor`'s
 * `only-export-components` — will not have a component file export
 * anything else.
 */

const WHITESPACE = /\s+/;

/**
 * A name with parts becomes an acronym; a single word — which most chess
 * usernames are — its own opening. Spread into code points, because
 * `"🐴rider".slice(0, 2)` cuts a surrogate pair in half.
 */
export function initialsOf(name: string): string {
  const [first = "", second = ""] = name.trim().split(WHITESPACE);
  const [opening = "", next = ""] = [...first];
  const [companion = ""] = [...second];

  return `${opening}${second ? companion : next}`.toUpperCase();
}

/**
 * `flag-icons` classes are the lowercase ISO 3166-1 alpha-2 code, and
 * `xx` is its "no flag" — so an unrecognised code lands on a blank
 * rather than a broken box.
 */
const FLAG_UNKNOWN = "xx";
const ISO_ALPHA2 = /^[A-Za-z]{2}$/;

export function flagClassOf(countryCode: string | undefined): string {
  const code = countryCode ?? "";
  return `fi fi-${ISO_ALPHA2.test(code) ? code.toLowerCase() : FLAG_UNKNOWN}`;
}
