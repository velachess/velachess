import { castlingSide, isNormal, parseSan, positionFromFen } from "@velachess/chess";
import type { Color } from "@velachess/chess";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const CHESS_SOUND = {
  MOVE_SELF: "move-self",
  MOVE_OPPONENT: "move-opponent",
  CAPTURE: "capture",
  CASTLE: "castle",
  CHECK: "move-check",
  PROMOTION: "promote",
  GAME_START: "game-start",
  GAME_END: "game-end",
} as const;

export type ChessSound = (typeof CHESS_SOUND)[keyof typeof CHESS_SOUND];

export const CHESS_SOUND_EVENT = {
  MOVE: "move",
  GAME_START: "game-start",
  GAME_END: "game-end",
} as const;

export type ChessSoundEvent =
  | {
      type: typeof CHESS_SOUND_EVENT.MOVE;
      fenBefore: string;
      san: string;
      /** Whose seat is watching. Omitted where there is no "opponent" —
       * drilling and practising is always your own move. */
      viewerColor?: Color | undefined;
    }
  | { type: typeof CHESS_SOUND_EVENT.GAME_START }
  | { type: typeof CHESS_SOUND_EVENT.GAME_END };

interface SoundPreferences {
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

const SOUND_PREFERENCES_STORAGE_KEY = "velachess.sound-preferences";

export const useSoundPreferences = create<SoundPreferences>()(
  persist(
    (set) => ({
      muted: false,
      setMuted: (muted) => set({ muted }),
    }),
    { name: SOUND_PREFERENCES_STORAGE_KEY, version: 1 },
  ),
);

export function soundForEvent(event: ChessSoundEvent): ChessSound | null {
  if (event.type === CHESS_SOUND_EVENT.GAME_START) return CHESS_SOUND.GAME_START;
  if (event.type === CHESS_SOUND_EVENT.GAME_END) return CHESS_SOUND.GAME_END;

  try {
    const position = positionFromFen(event.fenBefore).unwrap();
    const move = parseSan(position, event.san);
    if (!move || !isNormal(move)) return null;

    const movingPiece = position.board.get(move.from);
    if (!movingPiece) return null;

    const targetPiece = position.board.get(move.to);
    const isEnPassant =
      movingPiece.role === "pawn" &&
      position.epSquare === move.to &&
      targetPiece === undefined;
    const isCapture =
      targetPiece !== undefined && targetPiece.color !== movingPiece.color;
    const isPromotion = move.promotion !== undefined;
    const isCastle = castlingSide(position, move) !== undefined;

    position.play(move);

    // Checkmate is not its own category — there's no dedicated asset for
    // it, and it is always also a check (often also a capture), so it
    // falls out of the same priority as any other move.
    if (isPromotion) return CHESS_SOUND.PROMOTION;
    if (isCastle) return CHESS_SOUND.CASTLE;
    if (isCapture || isEnPassant) return CHESS_SOUND.CAPTURE;
    if (position.isCheck()) return CHESS_SOUND.CHECK;

    const isSelf =
      event.viewerColor === undefined || movingPiece.color === event.viewerColor;
    return isSelf ? CHESS_SOUND.MOVE_SELF : CHESS_SOUND.MOVE_OPPONENT;
  } catch {
    return null;
  }
}

const audioBySound = new Map<ChessSound, HTMLAudioElement>();

function playAsset(sound: ChessSound): void | Promise<void> {
  if (typeof Audio === "undefined") return;

  let audio = audioBySound.get(sound);
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
    // Safari has no ogg/vorbis decoder — asked once per sound, on the
    // element that will actually play it, rather than a throwaway probe.
    const ext = audio.canPlayType("audio/ogg; codecs=vorbis") ? "ogg" : "mp3";
    audio.src = `/sounds/chess/${ext}/${sound}.${ext}`;
    audioBySound.set(sound, audio);
  }
  audio.currentTime = 0;
  return audio.play();
}

export type SoundOutput = (sound: ChessSound) => void | Promise<void>;

/** Audio is fire-and-forget because playback failure must not affect chess. */
export function dispatchChessSound(
  event: ChessSoundEvent,
  muted: boolean,
  output: SoundOutput = playAsset,
): void {
  if (muted) return;
  const sound = soundForEvent(event);
  if (!sound) return;

  try {
    void Promise.resolve(output(sound)).catch(() => undefined);
  } catch {
    return;
  }
}

export function useChessSounds(): (event: ChessSoundEvent) => void {
  const muted = useSoundPreferences((state) => state.muted);
  return (event) => dispatchChessSound(event, muted);
}
