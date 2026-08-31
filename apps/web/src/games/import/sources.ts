import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type * as React from "react";

import { ChessComIcon, LichessIcon } from "@velachess/ui/icons";

import { z } from "../../libs/zod.ts";

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

/** The values the API already speaks, so nothing is translated on the way out. */
export const SOURCE_IDS = {
  chessCom: "chess_com",
  lichess: "lichess",
} as const;

export type SourceId = (typeof SOURCE_IDS)[keyof typeof SOURCE_IDS];

export interface ImportSource {
  id: SourceId;
  /** The platform's own name — not translated, it is a proper noun. */
  label: string;
  inputKind: InputKind;
  /** Shown in the field and used as its accessible name. */
  inputLabel: MessageDescriptor;
  /** Per render: zod bakes error text in, so it needs an active locale. */
  buildSchema: (translate: Translate) => z.ZodType<string, string>;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

/** Both platforms allow letters, digits, `_` and `-` — caught here to spare a round trip. */
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
    label: "Chess.com",
    inputKind: INPUT_KINDS.username,
    inputLabel: msg`Chess.com username`,
    buildSchema: buildUsernameSchema,
    icon: ChessComIcon,
  },
  [SOURCE_IDS.lichess]: {
    id: SOURCE_IDS.lichess,
    label: "Lichess",
    inputKind: INPUT_KINDS.username,
    inputLabel: msg`Lichess username`,
    buildSchema: buildUsernameSchema,
    icon: LichessIcon,
  },
} as const satisfies Record<SourceId, ImportSource>;

export const SOURCE_ORDER = [SOURCE_IDS.chessCom, SOURCE_IDS.lichess] as const;

export const DEFAULT_SOURCE_ID: SourceId = SOURCE_IDS.chessCom;

export const IMPORT_COPY = {
  title: msg`Import your games`,
  description: msg`VelaChess reads your public game archive to find where you leave your own repertoire. No password needed.`,
  submit: msg`Import`,
  submitting: msg`Reading your games…`,
  running: msg`Got them — opening your games.`,
  failed: msg`No games found for that username. Check the spelling and try again.`,
} as const;
