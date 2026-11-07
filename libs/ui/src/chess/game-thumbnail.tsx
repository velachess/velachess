import { defaultPieces, fenStringToPositionObject } from "react-chessboard";

import { BOARD_STYLE } from "./board-theme.ts";

const SIZE = 8;
const FILES = "abcdefgh";

const SEAT = {
  white: (file: number, rank: number) => ({ x: file, y: SIZE - 1 - rank }),
  black: (file: number, rank: number) => ({ x: SIZE - 1 - file, y: rank }),
} as const;

const LIGHT_SQUARES = Array.from({ length: SIZE * SIZE }, (_, index) => ({
  x: index % SIZE,
  y: Math.floor(index / SIZE),
}))
  .filter(({ x, y }) => (x + y) % 2 === 0)
  .map(({ x, y }) => `M${x} ${y}h1v1h-1z`)
  .join("");

export function GameThumbnail({
  fen,
  orientation = "white",
}: {
  fen: string;
  orientation?: "white" | "black";
}) {
  const position = fenStringToPositionObject(fen, SIZE, SIZE);

  return (
    <svg
      aria-hidden
      data-slot="game-thumbnail"
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="pointer-events-none aspect-square w-full"
    >
      <rect width={SIZE} height={SIZE} fill={BOARD_STYLE.dark.backgroundColor} />
      <path d={LIGHT_SQUARES} fill={BOARD_STYLE.light.backgroundColor} />
      {Object.entries(position).map(([square, { pieceType }]) => {
        const { x, y } = SEAT[orientation](
          FILES.indexOf(square.charAt(0)),
          Number(square.slice(1)) - 1,
        );
        return (
          <svg
            key={square}
            data-square={square}
            data-piece={pieceType}
            x={x}
            y={y}
            width={1}
            height={1}
          >
            {defaultPieces[pieceType]?.()}
          </svg>
        );
      })}
    </svg>
  );
}
