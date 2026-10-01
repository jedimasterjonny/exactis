import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScreenTabs } from "./screen-tabs";

function renderTabs(): void {
  render(
    <ScreenTabs
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

  it("lets the open panel take the focus, and rings it when it does", () => {
    renderTabs();

    const panel = screen.getByRole("tabpanel");

    expect(panel).toHaveAttribute("tabindex", "0");
    expect(panel).toHaveClass("focus-visible:ring-3");
  });
});
