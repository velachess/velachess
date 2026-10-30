import { useLingui } from "@lingui/react";
import { useState } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@velachess/ui/components/input-group";
import { Search, X } from "@velachess/ui/icons";

import { MAX_OPPONENT_LENGTH, SEARCH_COPY, type GamesSearch } from "./filters.ts";
import { useDebouncedCallback } from "./use-debounced-callback.ts";

const DEBOUNCE_MS = 250;

/** The typed text lives here and the committed term in the URL: the field
 * answers every keystroke, the list must not ask the server about one. */
export function GamesSearchBox({
  opponent,
  onChange,
}: {
  opponent: string | undefined;
  onChange: (next: Partial<GamesSearch>, options?: { replace?: boolean }) => void;
}) {
  const { i18n } = useLingui();
  const [draft, setDraft] = useState(opponent ?? "");
  const [asked, setAsked] = useState<{ term: string | undefined }>();

  const commit = (term: string) => {
    const next = term === "" ? undefined : term;
    setAsked({ term: next });
    // The first term is a history step; refining it is not, or the way
    // back walks every pause taken while typing.
    onChange({ opponent: next, page: 1 }, { replace: opponent !== undefined });
  };

  const commitSoon = useDebouncedCallback(commit, DEBOUNCE_MS);

  // Back and forward move the term under the field. A commit of this box's
  // own reaches `opponent` a render or two later and must not read as one,
  // so it is awaited by name; an uncommitted keystroke outranks both.
  if (asked !== undefined) {
    if (opponent === asked.term) setAsked(undefined);
  } else if (!commitSoon.isPending() && (opponent ?? "") !== draft) {
    setDraft(opponent ?? "");
  }

  const handleChange = (next: string) => {
    setDraft(next);
    commitSoon.call(next.trim());
  };

  const handleClear = () => {
    commitSoon.cancel();
    setDraft("");
    commit("");
  };

  return (
    <InputGroup className="w-full sm:w-64">
      <InputGroupInput
        value={draft}
        maxLength={MAX_OPPONENT_LENGTH}
        aria-label={i18n._(SEARCH_COPY.label)}
        placeholder={i18n._(SEARCH_COPY.placeholder)}
        onChange={(event) => handleChange(event.target.value)}
      />
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      {draft !== "" && (
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={i18n._(SEARCH_COPY.clear)}
            onClick={handleClear}
          >
            <X />
          </InputGroupButton>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
