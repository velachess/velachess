/** Pure: localising a rating is the caller's, needing an i18n instance. */
import { resolveGamePerspective } from "@velachess/chess";

import { flairImageOf } from "../import/index.ts";
import { seatIdentityOf, type Seat } from "./board-view.ts";
import type { ReplayableGame } from "./game-record.ts";

export type SeatedGame = Pick<
  ReplayableGame,
  | "perspective"
  | "whiteName"
  | "blackName"
  | "whiteRating"
  | "blackRating"
  | "whiteIdentity"
  | "blackIdentity"
>;

export interface PlayerSeat {
  name: string;
  /** Already localised, and absent when the platform reported none. */
  rating: string | undefined;
  /** Of a resolvable handle; absent for everyone else. */
  avatarUrl: string | undefined;
  flair: string | undefined;
}

export interface ReviewPlayers {
  orientation: Seat;
  top: PlayerSeat;
  bottom: PlayerSeat;
  /** Null when nobody knows which seat is yours: "you" is a claim. */
  mySeat: Seat | null;
}

export function usernamesOf(accounts: readonly { username: string }[]): string[] {
  return accounts.map((account) => account.username);
}

/**
 * Identity rides with the detail payload for both seats, the server
 * resolving each handle from a shared profile cache.
 */
function playerSeatOf(
  game: SeatedGame,
  side: Seat,
  formatRating: (rating: number) => string,
): PlayerSeat {
  const identity = seatIdentityOf(
    side === "white" ? game.whiteIdentity : game.blackIdentity,
  );
  const rating = side === "white" ? game.whiteRating : game.blackRating;

  return {
    name: side === "white" ? game.whiteName : game.blackName,
    rating: rating === null ? undefined : formatRating(rating),
    avatarUrl: identity.avatarUrl,
    // The API carries the flair id; the address it is served from is
    // presentation.
    flair: identity.flair ? flairImageOf(identity.flair) : undefined,
  };
}

export function reviewPlayersOf(
  game: SeatedGame,
  usernames: readonly string[],
  formatRating: (rating: number) => string,
): ReviewPlayers {
  const mySeat = resolveGamePerspective(game, usernames);
  const orientation = mySeat ?? "white";
  const white = playerSeatOf(game, "white", formatRating);
  const black = playerSeatOf(game, "black", formatRating);

  return {
    orientation,
    mySeat,
    top: orientation === "white" ? black : white,
    bottom: orientation === "white" ? white : black,
  };
}
