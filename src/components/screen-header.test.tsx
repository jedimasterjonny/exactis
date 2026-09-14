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

  it("renders a meta line only when a child actually renders", () => {
    const { rerender } = render(
      <ScreenHeader label="Sect. I" title="Title">
        {false}
      </ScreenHeader>,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Title",
    );

    rerender(
      <ScreenHeader label="Sect. I" title="Title">
        {"Figures in today's money"}
      </ScreenHeader>,
    );

    expect(screen.getByText("Figures in today's money")).toBeInTheDocument();
  });
});
