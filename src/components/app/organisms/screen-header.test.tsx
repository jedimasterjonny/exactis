import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScreenHeader } from "./screen-header";

describe("ScreenHeader", () => {
  it("renders the label and the title as the level-one heading", () => {
    render(
      <ScreenHeader label="Sect. I · Dashboard" title="Projected to age 91" />,
    );

    expect(screen.getByText("Sect. I · Dashboard")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age 91",
    );
  });

  // Handed the focus by a screen that takes away the control holding it,
  // as Compare does once a decision lands, and never tabbed to.
  it("takes the focus on its title when handed it, out of the tab order", () => {
    render(<ScreenHeader label="Sect. I · Dashboard" title="Four-day week" />);

    const title = screen.getByRole("heading", { level: 1 });
    title.focus();

    expect(title).toHaveFocus();
    expect(title).toHaveAttribute("tabindex", "-1");
  });

  // Nothing else names the section on a phone, so the header shows its
  // label at every width.
  it("shows the label at every width", () => {
    render(
      <ScreenHeader label="Sect. I · Dashboard" title="Projected to age 91" />,
    );

    expect(screen.getByText("Sect. I · Dashboard")).not.toHaveClass(
      "max-md:hidden",
    );
  });

  it("renders a meta line beneath the title", () => {
    render(
      <ScreenHeader label="Sect. I" title="Title">
        {"Figures in today's money"}
      </ScreenHeader>,
    );

    expect(screen.getByText("Figures in today's money")).toBeInTheDocument();
  });

  it("renders the actions beside the title", () => {
    render(
      <ScreenHeader
        actions={<button type="button">Assumptions</button>}
        label="Sect. I"
        title="Title"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Assumptions" }),
    ).toBeInTheDocument();
  });

  // jsdom lays nothing out, so the reflow classes on the layout containers
  // are checked directly.
  it("allows long meta and multiple actions to shrink and wrap on narrow viewports", () => {
    render(
      <ScreenHeader
        actions={
          <>
            <button type="button">Download</button>
            <button type="button">Replace</button>
          </>
        }
        label="Sect. IX · Portfolio"
        title="Portfolio"
      >
        long-filename.portfolio
      </ScreenHeader>,
    );

    // eslint-disable-next-line testing-library/no-node-access -- the heading column is a layout div with no accessible role of its own
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toHaveClass(
      "min-w-0",
      "grid-cols-1",
    );
    expect(screen.getByText("long-filename.portfolio")).toHaveClass("min-w-0");
    expect(
      // eslint-disable-next-line testing-library/no-node-access -- the actions wrapper is a layout div with no accessible role of its own
      screen.getByRole("button", { name: "Download" }).parentElement,
    ).toHaveClass("flex-wrap");
  });
});
