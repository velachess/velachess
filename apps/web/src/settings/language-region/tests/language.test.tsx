import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";

import { useLocaleStore } from "../../../i18n/locale-store.ts";
import { renderApp } from "../../../test/render.tsx";
import { sessionActive } from "../../../test/handlers/auth.ts";

describe("language", () => {
  afterEach(() => {
    useLocaleStore.setState(useLocaleStore.getInitialState(), true);
  });

  it("names the chosen language rather than its locale key", async () => {
    useLocaleStore.setState({ locale: "pt-BR" });
    sessionActive();

    await renderApp({ path: "/settings/language-region" });

    const select = await screen.findByRole("combobox", { name: "Language" });
    expect(select).toHaveTextContent("Português");
    expect(select).not.toHaveTextContent("pt-BR");
  });

  it("names the system default", async () => {
    sessionActive();

    await renderApp({ path: "/settings/language-region" });

    expect(await screen.findByRole("combobox", { name: "Language" })).toHaveTextContent(
      "System default",
    );
  });
});
