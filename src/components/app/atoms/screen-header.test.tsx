import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ScreenHeader } from "./screen-header";

describe("ScreenHeader", () => {
  it("renders the label and the title as the level-one heading", () => {
    render(
      <ScreenHeader label="Sect. I · Dashboard" title="Projected to age 89" />,
    );

    expect(screen.getByText("Sect. I · Dashboard")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Projected to age 89",
    );
  });

  // The frame's phone bar carries the label below the breakpoint it shows
  // under, so the header leaves its own off there rather than repeat it.
  it("leaves the label to the phone bar below the md breakpoint", () => {
    render(
      <ScreenHeader label="Sect. I · Dashboard" title="Projected to age 89" />,
    );

    expect(screen.getByText("Sect. I · Dashboard")).toHaveClass(
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
});
