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

/**
 * Settings → Account: who you are here, and how you get back in.
 *
 * Driven through the real router and the real shell, because half of what
 * this screen promises is navigational — that the user menu leads here,
 * that the section is behind the same wall as everything else, and that a
 * rename shows up in the shell it was performed from.
 */

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

    // Shown because people look for it; disabled because changing it is a
    // verification flow this build cannot complete. An input that accepts
    // typing and silently discards it would be the worse answer.
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

    // The point of routing the write through the session query: the name
    // in the shell is the same fact, so it cannot lag behind. Two places
    // now say "Magnus" — this screen's profile, and the menu — and that
    // is precisely the assertion.
    await user.click(desktopNav().getByRole("button", { name: "Account" }));
    await waitFor(() => expect(screen.getAllByText("Magnus")).toHaveLength(2));
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

    // Deliberate: unlinking the last method locks the person out, and the
    // guard for that is a decision, not a button this screen can render.
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
    // Chess.com and Lichess are where games come from, not ways in — that
    // list lives at Settings → Connections instead.
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

/** A real File, so the type and size guards see what a browser would give
 * them. The bytes never matter: jsdom's canvas is stubbed, so the encode
 * always yields the same one-byte blob. */
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

/** The avatar is the control, and its menu holds both actions. */
async function openAvatarMenu(user: { click: (element: Element) => Promise<void> }) {
  await user.click(await screen.findByRole("button", { name: "Change your picture" }));
}

describe("the avatar", () => {
  it("falls back to initials for an account with no picture", async () => {
    sessionActive();

    const { user } = await renderApp({ path: "/" });
    await user.click(await desktopNav().findByRole("button", { name: "Account" }));

    // "VelaChess User" → first and last initial.
    const menu = await screen.findByText(TEST_USER.email);
    expect(
      within(menu.closest("div")!.parentElement!).getByText("VU"),
    ).toBeInTheDocument();
  });
});

describe("changing the avatar", () => {
  /**
   * The avatar image is decorative — `alt=""`, because the name sits right
   * beside it — so it has no `img` role to query. The observable fact is
   * the one the user cares about: initials give way to a picture.
   */
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
    // The shell reads the same session query, so one invalidation refreshes
    // both — that is the whole reason the mutation invalidates rather than
    // writing the cache. Initials disappearing from the shell's user menu
    // is how that shows from outside.
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
   * `fireEvent`, not `user.upload`: userEvent enforces the input's `accept`
   * attribute and silently drops a non-matching file, so the change event
   * never fires and the guard is never reached. Browsers do not enforce it
   * that way — `accept` filters the picker's default view, a user can
   * switch it to all files, and a drop bypasses it entirely — which is why
   * the guard exists and why the test has to reach past userEvent to
   * exercise it. Same class of exception as pgn-import-dialog.test.tsx.
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
    // Still open, so the user can retry without picking the file again.
    expect(screen.getByRole("button", { name: "Save picture" })).toBeInTheDocument();
  });
});

/**
 * The avatar persists the moment it changes; the form's Save speaks for the
 * editable fields and nothing else. Keeping those apart is what stops Save
 * from implying the picture still needs saving.
 */
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
    // The session now carries the new name, so the field matches what is
    // stored and there is nothing left to save.
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
    // And the picture's own confirmation is not mistaken for the form's.
    expect(screen.queryByText("Saved.")).not.toBeInTheDocument();
  });
});
