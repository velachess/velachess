/**
 * What stepping the game sounds like. Playing a variation is silent:
 * those are someone's trial moves, not the game's.
 */
import { CHESS_SOUND_EVENT, playChessSound } from "../../chess-sounds/index.ts";
import { useMyAccounts } from "../import/index.ts";
import { seatOf } from "./board-view.ts";
import { usernamesOf, type SeatedGame } from "./review-presentation.ts";
import { REPLAY_NAVIGATION, type ReplayNavigation } from "./review-model.ts";

export function createReplayNavigation(game: SeatedGame): ReplayNavigation {
  return (event) => {
    if (event.type === REPLAY_NAVIGATION.START) {
      playChessSound({ type: CHESS_SOUND_EVENT.GAME_START });
      return;
    }

    // Read when the sound plays rather than captured: tracked accounts
    // can land after the screen mounted, and `playChessSound` reads the
    // mute preference the same way.
    const accounts = useMyAccounts.getState().accounts;

    playChessSound({
      type: CHESS_SOUND_EVENT.MOVE,
      fenBefore: event.move.fenBefore,
      san: event.move.san,
      viewerColor: seatOf(game, usernamesOf(accounts)),
    });
  };
}
