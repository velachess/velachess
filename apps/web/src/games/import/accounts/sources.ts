import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

import { z } from "../../../libs/zod.ts";
import type { GameSource } from "../../game-sources.tsx";

export type Translate = (message: MessageDescriptor) => string;

const VALIDATION_MESSAGES = {
  usernameRequired: msg`Enter your username`,
  usernameTooLong: msg`That username is too long`,
  usernameCharacters: msg`Letters, numbers, hyphen and underscore only`,
} as const;

export const INPUT_KINDS = {
  username: "username",
  paste: "paste",
} as const;

type InputKind = (typeof INPUT_KINDS)[keyof typeof INPUT_KINDS];

/**
 * A game source minus the one nobody has an account with, as a subtraction
 * so adding a source makes the choice explicit.
 */
export type SourceId = Exclude<GameSource, "pgn">;

/** The values the API speaks, so nothing is translated on the way out. */
export const SOURCE_IDS = {
  chessCom: "chess_com",
  lichess: "lichess",
} as const satisfies Record<string, SourceId>;

/**
 * What the connect form needs on top of the name and mark every screen
 * reads from `games/game-sources.tsx`.
 */
export interface ImportSource {
  id: SourceId;
  inputKind: InputKind;
  /** Shown in the field, and its accessible name. */
  inputLabel: MessageDescriptor;
  /** Built per render: zod bakes the error text in and needs a locale. */
  buildSchema: (translate: Translate) => z.ZodType<string, string>;
}

/** Both platforms allow letters, digits, `_` and `-`; caught here to spare
 * a round trip. */
const buildUsernameSchema = (translate: Translate) =>
  z
    .string()
    .trim()
    .min(1, translate(VALIDATION_MESSAGES.usernameRequired))
    .max(64, translate(VALIDATION_MESSAGES.usernameTooLong))
    .regex(/^[\w-]+$/, translate(VALIDATION_MESSAGES.usernameCharacters));

export const IMPORT_SOURCES = {
  [SOURCE_IDS.chessCom]: {
    id: SOURCE_IDS.chessCom,
    inputKind: INPUT_KINDS.username,
    inputLabel: msg`Chess.com username`,
    buildSchema: buildUsernameSchema,
  },
  [SOURCE_IDS.lichess]: {
    id: SOURCE_IDS.lichess,
    inputKind: INPUT_KINDS.username,
    inputLabel: msg`Lichess username`,
    buildSchema: buildUsernameSchema,
  },
} as const satisfies Record<SourceId, ImportSource>;

export const SOURCE_ORDER = [SOURCE_IDS.chessCom, SOURCE_IDS.lichess] as const;

export const DEFAULT_SOURCE_ID: SourceId = SOURCE_IDS.chessCom;

export const IMPORT_COPY = {
  title: msg`Import your games`,
  description: msg`VelaChess reads your public game archive so you can review them with Stockfish. No password needed.`,
  submit: msg`Import`,
  submitting: msg`Reading your games…`,
  running: msg`Got them — opening your games.`,
  failed: msg`No games found for that username. Check the spelling and try again.`,
  alreadyConnectedTitle: msg`{platform} is connected`,
  alreadyConnectedDescription: msg`VelaChess tracks one account per platform. {username} is connected — remove that connection to use a different handle.`,
} as const;
