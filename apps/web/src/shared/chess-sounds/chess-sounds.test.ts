import {
  CASTLING_AVAILABLE,
  EN_PASSANT_AVAILABLE,
  STARTING_POSITION,
} from "@velachess/fixtures";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CHESS_SOUND,
  CHESS_SOUND_EVENT,
  dispatchChessSound,
  soundForEvent,
  useSoundPreferences,
} from "./chess-sounds.ts";

afterEach(() => vi.unstubAllGlobals());

describe("soundForEvent", () => {
  it("maps a normal move", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: STARTING_POSITION,
        san: "e4",
      }),
    ).toBe(CHESS_SOUND.MOVE);
  });

  it("maps a capture", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: "4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1",
        san: "exd5",
      }),
    ).toBe(CHESS_SOUND.CAPTURE);
  });

  it("maps en passant as its own event", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: EN_PASSANT_AVAILABLE,
        san: "exf6",
      }),
    ).toBe(CHESS_SOUND.CAPTURE);
  });

  it("maps a quiet promotion", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: "8/P7/8/8/8/8/7k/5K2 w - - 0 1",
        san: "a8=Q",
      }),
    ).toBe(CHESS_SOUND.PROMOTION);
  });

  it("keeps promotion distinct from a capture", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: "r7/1P5k/8/8/8/8/8/7K w - - 0 1",
        san: "bxa8=Q",
      }),
    ).toBe(CHESS_SOUND.PROMOTION);
  });

  it("maps check to the normal move sound", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: "4k3/R7/8/8/8/8/8/4K3 w - - 0 1",
        san: "Re7+",
      }),
    ).toBe(CHESS_SOUND.MOVE);
  });

  it("keeps the capture sound for capture with check", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: "4k3/4r3/8/8/8/8/8/4R2K w - - 0 1",
        san: "Rxe7+",
      }),
    ).toBe(CHESS_SOUND.CAPTURE);
  });

  it("keeps promotion distinct when it gives check", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: "7k/P7/8/8/8/8/8/7K w - - 0 1",
        san: "a8=Q+",
      }),
    ).toBe(CHESS_SOUND.PROMOTION);
  });

  it("maps kingside castling to the normal move sound", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: CASTLING_AVAILABLE,
        san: "O-O",
      }),
    ).toBe(CHESS_SOUND.MOVE);
  });

  it("maps queenside castling to the normal move sound", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: CASTLING_AVAILABLE,
        san: "O-O-O",
      }),
    ).toBe(CHESS_SOUND.MOVE);
  });

  it("maps castling with check to the normal move sound", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: "5k2/8/8/8/8/8/8/4K2R w K - 0 1",
        san: "O-O+",
      }),
    ).toBe(CHESS_SOUND.MOVE);
  });

  it("maps checkmate to the heavier capture sound", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2",
        san: "Qh4#",
      }),
    ).toBe(CHESS_SOUND.CAPTURE);
  });

  it("maps game start", () => {
    expect(soundForEvent({ type: CHESS_SOUND_EVENT.GAME_START })).toBe(CHESS_SOUND.MOVE);
  });

  it("maps game end", () => {
    expect(soundForEvent({ type: CHESS_SOUND_EVENT.GAME_END })).toBe(CHESS_SOUND.MOVE);
  });

  it("does not invent a sound for an illegal or unparseable move", () => {
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: STARTING_POSITION,
        san: "e5",
      }),
    ).toBeNull();
    expect(
      soundForEvent({
        type: CHESS_SOUND_EVENT.MOVE,
        fenBefore: STARTING_POSITION,
        san: "not-a-move",
      }),
    ).toBeNull();
  });
});

describe("dispatchChessSound", () => {
  it("plays the one sound selected for an event", () => {
    const output = vi.fn();

    dispatchChessSound({ type: CHESS_SOUND_EVENT.GAME_START }, false, output);

    expect(output).toHaveBeenCalledOnce();
    expect(output).toHaveBeenCalledWith(CHESS_SOUND.MOVE);
  });

  it("does nothing while muted", () => {
    const output = vi.fn();

    dispatchChessSound({ type: CHESS_SOUND_EVENT.GAME_END }, true, output);

    expect(output).not.toHaveBeenCalled();
  });

  it("persists the mute preference on this device", () => {
    useSoundPreferences.getState().setMuted(true);

    expect(useSoundPreferences.getState().muted).toBe(true);
    expect(localStorage.getItem("velachess.sound-preferences")).toContain('"muted":true');
  });

  it("contains synchronous audio failures", () => {
    expect(() =>
      dispatchChessSound({ type: CHESS_SOUND_EVENT.GAME_END }, false, () => {
        throw new Error("audio unavailable");
      }),
    ).not.toThrow();
  });

  it("reuses audio, restarts rapid playback, and contains play rejection", async () => {
    const play = vi
      .fn<() => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("play rejected"));
    const instances: FakeAudio[] = [];

    class FakeAudio {
      currentTime = 0.8;
      preload = "";

      constructor(readonly src: string) {
        instances.push(this);
      }

      play = play;
    }

    vi.stubGlobal("Audio", FakeAudio);

    dispatchChessSound({ type: CHESS_SOUND_EVENT.GAME_START }, false);
    const audio = instances[0];
    if (!audio) throw new Error("Audio was not created");
    audio.currentTime = 0.5;
    dispatchChessSound({ type: CHESS_SOUND_EVENT.GAME_START }, false);

    await Promise.resolve();

    expect(instances).toHaveLength(1);
    expect(audio.src).toBe("/sounds/chess/move.ogg");
    expect(audio.preload).toBe("auto");
    expect(audio.currentTime).toBe(0);
    expect(play).toHaveBeenCalledTimes(2);
  });
});
