import { isNormal, parseSan, positionFromFen } from "@velachess/chess";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export const CHESS_SOUND = {
  MOVE: "move",
  CAPTURE: "capture",
  PROMOTION: "promotion",
} as const;

export type ChessSound = (typeof CHESS_SOUND)[keyof typeof CHESS_SOUND];

export const CHESS_SOUND_EVENT = {
  MOVE: "move",
  GAME_START: "game-start",
  GAME_END: "game-end",
} as const;

export type ChessSoundEvent =
  | { type: typeof CHESS_SOUND_EVENT.MOVE; fenBefore: string; san: string }
  | { type: typeof CHESS_SOUND_EVENT.GAME_START }
  | { type: typeof CHESS_SOUND_EVENT.GAME_END };

const SOUND_URL: Record<ChessSound, string> = {
  [CHESS_SOUND.MOVE]: "/sounds/chess/move.ogg",
  [CHESS_SOUND.CAPTURE]: "/sounds/chess/capture.ogg",
  [CHESS_SOUND.PROMOTION]: "/sounds/chess/promotion.ogg",
};

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
  if (event.type === CHESS_SOUND_EVENT.GAME_START) return CHESS_SOUND.MOVE;
  if (event.type === CHESS_SOUND_EVENT.GAME_END) return CHESS_SOUND.MOVE;

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

    position.play(move);

    if (position.isCheckmate()) return CHESS_SOUND.CAPTURE;
    if (isPromotion) return CHESS_SOUND.PROMOTION;
    if (isCapture || isEnPassant) return CHESS_SOUND.CAPTURE;
    return CHESS_SOUND.MOVE;
  } catch {
    return null;
  }
}

const audioByUrl = new Map<string, HTMLAudioElement>();

function playAsset(sound: ChessSound): void | Promise<void> {
  if (typeof Audio === "undefined") return;

  const url = SOUND_URL[sound];
  let audio = audioByUrl.get(url);
  if (!audio) {
    audio = new Audio(url);
    audio.preload = "auto";
    audioByUrl.set(url, audio);
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
