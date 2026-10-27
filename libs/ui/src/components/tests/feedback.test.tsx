import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";

import { Alert, AlertDescription, AlertTitle } from "../alert.tsx";
import { createToastManager, Toaster } from "../toast.tsx";

it("announces an alert by its title and exposes its variant", () => {
  render(
    <Alert variant="destructive" aria-labelledby="outage-title">
      <AlertTitle id="outage-title">Backend unavailable</AlertTitle>
      <AlertDescription>Unable to connect.</AlertDescription>
    </Alert>,
  );

  expect(
    screen
      .getByRole("alert", { name: "Backend unavailable" })
      .getAttribute("data-variant"),
  ).toBe("destructive");
});

it("shows a toast in a polite live region with its status icon, until closed", async () => {
  const toastManager = createToastManager();
  render(<Toaster toastManager={toastManager} />);

  act(() => {
    toastManager.add({ type: "success", title: "Games imported" });
  });

  const region = await screen.findByRole("region");
  expect(region.getAttribute("aria-live")).toBe("polite");
  const toast = within(region).getByText("Games imported").closest("[data-slot='toast']");
  expect(toast?.getAttribute("data-type")).toBe("success");
  expect(toast?.querySelector("[data-slot='toast-icon'] svg")).not.toBeNull();

  fireEvent.click(within(region).getByLabelText("Close toast"));

  await waitFor(() => expect(screen.queryByText("Games imported")).toBeNull());
});

it("moves one toast from loading to its outcome when the promise settles", async () => {
  const toastManager = createToastManager();
  render(<Toaster toastManager={toastManager} />);
  let resolve: ((value: string) => void) | undefined;
  const pending = new Promise<string>((done) => {
    resolve = done;
  });

  act(() => {
    void toastManager.promise(pending, {
      loading: "Importing…",
      success: "Imported",
      error: "Import failed",
    });
  });

  await screen.findByText("Importing…");

  await act(async () => {
    resolve?.("ok");
    await pending;
  });

  await screen.findByText("Imported");
  expect(screen.queryByText("Importing…")).toBeNull();
  expect(document.querySelectorAll("[data-slot='toast']")).toHaveLength(1);
});
