import { useLingui } from "@lingui/react";
import { useEffect, useRef, useState } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@velachess/ui/components/input-group";
import { Search, X } from "@velachess/ui/icons";

import { SEARCH_COPY, type GamesSearch } from "./filters.ts";

const DEBOUNCE_MS = 250;

/** The typed text lives here and the committed term in the URL: the field
 * answers every keystroke, the list must not ask the server about one. */
export function GamesSearchBox({
  opponent,
  onChange,
}: {
  opponent: string | undefined;
  onChange: (next: Partial<GamesSearch>) => void;
}) {
  const { i18n } = useLingui();
  const [draft, setDraft] = useState(opponent ?? "");
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(pending.current), []);

  const commit = (term: string) => {
    clearTimeout(pending.current);
    onChange({ opponent: term === "" ? undefined : term, page: 1 });
  };

  const handleChange = (next: string) => {
    setDraft(next);
    clearTimeout(pending.current);
    pending.current = setTimeout(() => commit(next.trim()), DEBOUNCE_MS);
  };

  const handleClear = () => {
    setDraft("");
    commit("");
  };

  return (
    <InputGroup className="w-full sm:w-64">
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput
        value={draft}
        aria-label={i18n._(SEARCH_COPY.label)}
        placeholder={i18n._(SEARCH_COPY.placeholder)}
        onChange={(event) => handleChange(event.target.value)}
      />
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
