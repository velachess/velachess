import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { SIDEBAR_WIDTH } from "../../lib/sidebar-width.ts";
import { Sidebar, SidebarProvider, SidebarRail } from "../sidebar.tsx";

const RAIL_LABEL = "Resize navigation";

function Harness({
  initialOpen = true,
  initialWidth = SIDEBAR_WIDTH.default,
  onWidthCommit = () => undefined,
}: {
  initialOpen?: boolean;
  initialWidth?: number;
  onWidthCommit?: (width: number) => void;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [width, setWidth] = useState(initialWidth);

  function handleWidthChange(next: number) {
    setWidth(next);
    onWidthCommit(next);
  }

  return (
    <SidebarProvider
      open={open}
      onOpenChange={setOpen}
      width={width}
      onWidthChange={handleWidthChange}
    >
      <Sidebar>
        <SidebarRail aria-label={RAIL_LABEL} />
      </Sidebar>
    </SidebarProvider>
  );
}

function rail() {
  return screen.getByRole("separator", { name: RAIL_LABEL });
}

function sidebarState() {
  return document.querySelector("[data-slot=sidebar]")?.getAttribute("data-state");
}

function renderedWidth() {
  return document
    .querySelector<HTMLElement>("[data-slot=sidebar-wrapper]")
    ?.style.getPropertyValue("--sidebar-width");
}

function dragRail(from: number, path: number[]) {
  fireEvent.pointerDown(rail(), { clientX: from, button: 0, pointerId: 1 });
  for (const clientX of path) {
    fireEvent.pointerMove(rail(), { clientX, pointerId: 1 });
  }
}

function releaseRail(clientX: number) {
  fireEvent.pointerUp(rail(), { clientX, pointerId: 1 });
}

beforeAll(() => {
  HTMLElement.prototype.setPointerCapture = () => undefined;
});

describe("dragging the rail", () => {
  it("previews the width while dragging and commits it once on release", () => {
    const onWidthCommit = vi.fn();
    render(<Harness onWidthCommit={onWidthCommit} />);

    dragRail(256, [270, 290, 300]);

    expect(renderedWidth()).toBe("300px");
    expect(onWidthCommit).not.toHaveBeenCalled();

    releaseRail(300);

    expect(onWidthCommit).toHaveBeenCalledTimes(1);
    expect(onWidthCommit).toHaveBeenCalledWith(300);
  });

  it("keeps the width between its minimum and maximum", () => {
    const onWidthCommit = vi.fn();
    render(<Harness onWidthCommit={onWidthCommit} />);

    dragRail(256, [900]);
    releaseRail(900);
    expect(onWidthCommit).toHaveBeenLastCalledWith(SIDEBAR_WIDTH.max);

    dragRail(SIDEBAR_WIDTH.max, [180]);
    releaseRail(180);
    expect(onWidthCommit).toHaveBeenLastCalledWith(SIDEBAR_WIDTH.min);
    expect(sidebarState()).toBe("expanded");
  });

  it("collapses to icons past the threshold and keeps the expanded width", () => {
    const onWidthCommit = vi.fn();
    render(<Harness onWidthCommit={onWidthCommit} />);

    dragRail(256, [200, 100]);

    expect(sidebarState()).toBe("collapsed");
    expect(renderedWidth()).toBe("256px");

    releaseRail(100);

    expect(sidebarState()).toBe("collapsed");
    expect(onWidthCommit).not.toHaveBeenCalled();
  });

  it("expands again when dragged outward from icons", () => {
    const onWidthCommit = vi.fn();
    render(<Harness initialOpen={false} onWidthCommit={onWidthCommit} />);

    dragRail(48, [120, 240]);
    releaseRail(240);

    expect(sidebarState()).toBe("expanded");
    expect(onWidthCommit).toHaveBeenCalledWith(240);
  });

  it("toggles on a press that does not move", () => {
    render(<Harness />);

    dragRail(256, [257]);
    releaseRail(257);

    expect(sidebarState()).toBe("collapsed");
  });
});

describe("from the keyboard", () => {
  it("resizes with the arrow keys and collapses below the minimum", () => {
    render(<Harness initialWidth={SIDEBAR_WIDTH.min + 16} />);

    fireEvent.keyDown(rail(), { key: "ArrowRight" });
    expect(rail().getAttribute("aria-valuenow")).toBe(String(SIDEBAR_WIDTH.min + 32));

    fireEvent.keyDown(rail(), { key: "ArrowLeft" });
    fireEvent.keyDown(rail(), { key: "ArrowLeft" });
    expect(rail().getAttribute("aria-valuenow")).toBe(String(SIDEBAR_WIDTH.min));
    expect(sidebarState()).toBe("expanded");

    fireEvent.keyDown(rail(), { key: "ArrowLeft" });
    expect(sidebarState()).toBe("collapsed");

    fireEvent.keyDown(rail(), { key: "ArrowRight" });
    expect(sidebarState()).toBe("expanded");
  });

  it("toggles with Enter on the rail", () => {
    render(<Harness />);

    fireEvent.keyDown(rail(), { key: "Enter" });

    expect(sidebarState()).toBe("collapsed");
  });

  it("toggles with Cmd/Ctrl+B anywhere", () => {
    render(<Harness />);

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(sidebarState()).toBe("collapsed");

    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(sidebarState()).toBe("expanded");
  });
});

it("draws a persisted width outside the bounds at the nearest bound", () => {
  render(<Harness initialWidth={9000} />);

  expect(renderedWidth()).toBe(`${SIDEBAR_WIDTH.max}px`);
});
