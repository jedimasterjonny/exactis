import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScreenTabs } from "./screen-tabs";

function renderTabs(open?: string): void {
  render(
    <ScreenTabs
      open={open}
      tabs={[
        { children: <p>The rates</p>, label: "Rates" },
        { children: <p>The targets</p>, label: "Target allocation" },
      ]}
    />,
  );
}

describe("ScreenTabs", () => {
  it("names each tab and opens on the first, showing only what it holds", () => {
    renderTabs();

    expect(
      screen.getAllByRole("tab").map((tab) => tab.textContent),
    ).toStrictEqual(["Rates", "Target allocation"]);
    expect(screen.getByRole("tab", { name: "Rates" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel")).toHaveTextContent("The rates");
  });

  // The address names a tab by its label in lower case with a hyphen for
  // each space.
  it("opens on the tab the address names", () => {
    renderTabs("target-allocation");

    expect(
      screen.getByRole("tab", { name: "Target allocation" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("The targets");
  });

  it("opens on the first tab where the address names one the screen does not have", () => {
    renderTabs("glide-path");

    expect(screen.getByRole("tab", { name: "Rates" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  // The panel left is kept in the document, hidden, rather than drawn
  // afresh when it is opened again, so what it holds keeps whatever it
  // was doing while the other tab was open.
  it("opens the tab chosen in place of the one open, keeping the one left hidden", () => {
    renderTabs();

    const rates = screen.getByRole("tabpanel");
    fireEvent.click(screen.getByRole("tab", { name: "Target allocation" }));

    expect(screen.getByRole("tabpanel")).toHaveTextContent("The targets");
    expect(rates).toBeInTheDocument();
    expect(rates).not.toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Rates" }));

    expect(screen.getByRole("tabpanel")).toBe(rates);
  });

  // A chart in a tab left is sized to the box its panel keeps, which a
  // panel taken out of the layout would not give it.
  it("keeps the panel left in the layout, unseen", () => {
    renderTabs();

    const rates = screen.getByRole("tabpanel");
    fireEvent.click(screen.getByRole("tab", { name: "Target allocation" }));

    expect(rates).not.toHaveStyle({ display: "none" });
    expect(rates).toHaveStyle({ visibility: "hidden" });
  });

  // A row wider than the body scrolls inside it; centred, it would spill
  // past its start, where no scroll reaches, and at the registry's fixed
  // height a desktop's scrollbar would be drawn over the tabs.
  it("keeps the tabs to the body's width, scrolling them from the first", () => {
    renderTabs();

    const list = screen.getByRole("tablist");

    expect(list).toHaveClass(
      "max-w-full",
      "overflow-x-auto",
      "overflow-y-hidden",
      "justify-start",
      "group-data-horizontal/tabs:h-auto",
    );
    expect(list).not.toHaveClass("justify-center");
    expect(list).not.toHaveClass("group-data-horizontal/tabs:h-8");
  });

  // jsdom has no pointer to match, so the class that keys on one is read.
  it("draws each tab 44px tall on a touch screen", () => {
    renderTabs();

    for (const tab of screen.getAllByRole("tab")) {
      expect(tab).toHaveClass("pointer-coarse:min-h-11");
    }
  });

  it("lets the open panel take the focus, and rings it when it does", () => {
    renderTabs();

    const panel = screen.getByRole("tabpanel");

    expect(panel).toHaveAttribute("tabindex", "0");
    expect(panel).toHaveClass("focus-visible:ring-3");
  });

  // jsdom forces no colours, so the classes that do are what is read.
  it("fills the open tab in the system's highlight under forced colours, in the dark theme too, and rings its focus in the text colour", () => {
    renderTabs();

    expect(screen.getByRole("tab", { name: "Rates" })).toHaveClass(
      "forced-colors:data-active:bg-[Highlight]",
      "forced-colors:data-active:text-[HighlightText]",
      "forced-colors:data-active:forced-color-adjust-none",
      "forced-colors:dark:data-active:bg-[Highlight]",
      "forced-colors:dark:data-active:text-[HighlightText]",
      "forced-colors:focus-visible:ring-[CanvasText]",
    );
  });
});
