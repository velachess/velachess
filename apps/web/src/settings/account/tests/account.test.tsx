import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { desktopNav, mainContent, renderApp } from "../../../test/render.tsx";
import { server } from "../../../test/server.ts";
import {
  linkedProvidersAre,
  sessionActive,
  sessionInactive,
  TEST_USER,
} from "../../../test/handlers/auth.ts";

describe("reaching the account screen", () => {
  it("opens from the user menu", async () => {
    sessionActive();

    const { router, user } = await renderApp({ path: "/" });

    await user.click(await desktopNav().findByRole("button", { name: "Account" }));
    await user.click(await screen.findByRole("menuitem", { name: "Settings" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/settings/account"));
    expect(await screen.findByRole("heading", { name: "Account" })).toBeInTheDocument();
  });

  it("sends /settings to the only section there is", async () => {
    sessionActive();

    const { router } = await renderApp({ path: "/settings" });

    expect(router.state.location.pathname).toBe("/settings/account");
  });

  it("is behind the same wall as the rest of the app", async () => {
    sessionInactive();

    const { router } = await renderApp({ path: "/settings/account" });

    expect(router.state.location.pathname).toBe("/login");
  });
});

describe("the profile", () => {
  it("shows who is signed in", async () => {
    sessionActive();

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByDisplayValue(TEST_USER.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(TEST_USER.email)).toBeInTheDocument();
  });

  it("will not let the email be edited here", async () => {
    sessionActive();

    await renderApp({ path: "/settings/account" });

    // Shown because people look for it, disabled because changing it needs
    // a verification flow this build cannot complete.
    const email = await screen.findByLabelText("Email");
    expect(email).toBeDisabled();
    expect(
      screen.getByText(
        "Your email is tied to how you signed up and can't be changed here.",
      ),
    ).toBeInTheDocument();
  });

  it("renames the person, and the shell agrees", async () => {
    sessionActive();

    const { user } = await renderApp({ path: "/settings/account" });

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Magnus");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();

    await waitFor(() => expect(desktopNav().getByText("Magnus")).toBeInTheDocument());
  });

  it("refuses an empty name instead of saving one", async () => {
    sessionActive();

    let wrote = false;
    server.use(
      http.post("/api/auth/update-user", () => {
        wrote = true;
        return HttpResponse.json({ status: true });
      }),
    );

    const { user } = await renderApp({ path: "/settings/account" });

    await user.clear(await screen.findByLabelText("Name"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a name.")).toBeInTheDocument();
    expect(wrote).toBe(false);
  });

  it("says so when the save fails", async () => {
    sessionActive();
    server.use(
      http.post("/api/auth/update-user", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    const { user } = await renderApp({ path: "/settings/account" });

    const name = await screen.findByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Magnus");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Couldn't save that. Try again.")).toBeInTheDocument();
  });
});

describe("sign-in methods", () => {
  it("lists the password when that is the only way in", async () => {
    sessionActive();
    linkedProvidersAre(["credential"]);

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByText("Email and password")).toBeInTheDocument();
    expect(screen.queryByText("Google")).not.toBeInTheDocument();
  });

  it("lists both when the account has both", async () => {
    sessionActive();
    linkedProvidersAre(["credential", "google"]);

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByText("Google")).toBeInTheDocument();
    expect(screen.getByText("Email and password")).toBeInTheDocument();
  });

  it("shows only Google for an account that has never had a password", async () => {
    sessionActive();
    linkedProvidersAre(["google"]);

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByText("Google")).toBeInTheDocument();
    expect(screen.queryByText("Email and password")).not.toBeInTheDocument();
  });

  it("offers no way to unlink one", async () => {
    sessionActive();
    linkedProvidersAre(["credential", "google"]);

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByText("Google")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /disconnect|unlink|remove/i }),
    ).toBeNull();
  });

  it("keeps chess platforms out of this list", async () => {
    sessionActive();
    linkedProvidersAre(["credential", "google"]);

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByText("Google")).toBeInTheDocument();
    expect(screen.queryByText("Chess.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Lichess")).not.toBeInTheDocument();
  });

  it("says so when the list cannot be loaded, without hiding the profile", async () => {
    sessionActive();
    server.use(
      http.get("/api/auth/list-accounts", () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );

    await renderApp({ path: "/settings/account" });

    expect(
      await screen.findByText("Couldn't load your sign-in methods."),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue(TEST_USER.name)).toBeInTheDocument();
  });
});

/** A real File, so the type and size guards see what a browser gives them.
 * The bytes never matter: jsdom's canvas is stubbed. */
function imageFile({
  type = "image/png",
  bytes = 8,
}: { type?: string; bytes?: number } = {}): File {
  return new File([new Uint8Array(bytes)], "picture.png", { type });
}

async function openAccount() {
  sessionActive();
  return renderApp({ path: "/settings/account" });
}

async function openAvatarMenu(user: { click: (element: Element) => Promise<void> }) {
  await user.click(await screen.findByRole("button", { name: "Change your picture" }));
}

describe("the avatar", () => {
  it("falls back to initials for an account with no picture", async () => {
    sessionActive();

    const { user } = await renderApp({ path: "/" });
    await user.click(await desktopNav().findByRole("button", { name: "Account" }));

    const menu = await screen.findByText(TEST_USER.email);
    expect(
      within(menu.closest("div")!.parentElement!).getByText("VU"),
    ).toBeInTheDocument();
  });
});

describe("changing the avatar", () => {
  /** The avatar is decorative (`alt=""`), so it has no `img` role to query. */
  it("shows a stored picture instead of initials", async () => {
    sessionActive({ ...TEST_USER, image: "/api/me/avatar?v=7" });

    await renderApp({ path: "/settings/account" });

    expect(await screen.findByRole("heading", { name: "Profile" })).toBeInTheDocument();
    expect(mainContent().queryByText("VU")).not.toBeInTheDocument();
  });

  it("uploads a cropped picture and shows it in the shell too", async () => {
    const { user } = await openAccount();

    await openAvatarMenu(user);
    await user.upload(await screen.findByLabelText("Change picture"), imageFile());
    await user.click(await screen.findByRole("button", { name: "Save picture" }));

    expect(await screen.findByText("Picture updated.")).toBeInTheDocument();
    await user.click(await desktopNav().findByRole("button", { name: "Account" }));
    await waitFor(() => {
      expect(screen.queryByText("VU")).not.toBeInTheDocument();
    });
  });

  it("removes it and comes back to initials", async () => {
    sessionActive({ ...TEST_USER, image: "/api/me/avatar?v=3" });
    const { user } = await renderApp({ path: "/settings/account" });

    await openAvatarMenu(user);
    await user.click(await screen.findByRole("menuitem", { name: "Remove picture" }));

    expect(await screen.findByText("Picture removed.")).toBeInTheDocument();
    await waitFor(() => {
      expect(mainContent().getByText("VU")).toBeInTheDocument();
    });
  });

  /**
   * `fireEvent`, not `user.upload`: userEvent enforces `accept` and drops a
   * non-matching file; a browser does not, which is why the guard exists.
   */
  it("refuses a file that is not an image we accept", async () => {
    await openAccount();
    const input = await screen.findByLabelText("Change picture");

    fireEvent.change(input, {
      target: {
        files: [new File(["not an image"], "notes.txt", { type: "text/plain" })],
      },
    });

    expect(
      await screen.findByText("Choose a JPEG, PNG or WebP image."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save picture" }),
    ).not.toBeInTheDocument();
  });

  it("refuses a file too large to decode", async () => {
    const { user } = await openAccount();

    await user.upload(
      await screen.findByLabelText("Change picture"),
      imageFile({ bytes: 9 * 1024 * 1024 }),
    );

    expect(
      await screen.findByText("That image is too large. Choose one under 8 MB."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save picture" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the dialog open and says so when the upload fails", async () => {
    server.use(
      http.post("/api/me/avatar", () =>
        HttpResponse.json({ error: "boom" }, { status: 500 }),
      ),
    );
    const { user } = await openAccount();

    await user.upload(await screen.findByLabelText("Change picture"), imageFile());
    await user.click(await screen.findByRole("button", { name: "Save picture" }));

    expect(
      await screen.findByText("Couldn't save that picture. Try again."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save picture" })).toBeInTheDocument();
  });
});

describe("what Save is responsible for", () => {
  it("is unavailable while nothing has been edited", async () => {
    await openAccount();

    expect(await screen.findByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("becomes available once the name differs, and goes quiet again after saving", async () => {
    const { user } = await openAccount();
    const name = await screen.findByDisplayValue(TEST_USER.name);

    await user.type(name, " Jr");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Saved.")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });
  });

  it("stays unavailable when only the picture changed", async () => {
    const { user } = await openAccount();

    await openAvatarMenu(user);
    await user.upload(await screen.findByLabelText("Change picture"), imageFile());
    await user.click(await screen.findByRole("button", { name: "Save picture" }));
    expect(await screen.findByText("Picture updated.")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });
});
