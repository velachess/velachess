// ponytail: only re-exports what a consumer outside this vertical actually
// uses today (knip-verified) — CHESS_SOUND, dispatchChessSound,
// soundForEvent, and the ChessSound/ChessSoundEvent/SoundOutput types stay
// internal to chess-sounds.ts and its own test. Add them here the day an
// outside caller needs them.
export {
  CHESS_SOUND_EVENT,
  useChessSounds,
  useSoundPreferences,
} from "./chess-sounds.ts";
export { SoundToggle } from "./sound-toggle.tsx";
