import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SectionHeader } from "./section-header";

describe("SectionHeader", () => {
  it("renders the label and the title as the level-two heading", () => {
    render(<SectionHeader label="Sect. III.i" title="Income by year" />);

    expect(screen.getByText("Sect. III.i")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Income by year",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the meta line beneath and the actions beside when given", () => {
    render(
      <SectionHeader
        actions={<button type="button">Add income line</button>}
        label="Sect. III.iii"
        title="Cash flow each month"
      >
        {"2026, age 36, in today's money"}
      </SectionHeader>,
    );

    expect(
      screen.getByText("2026, age 36, in today's money"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add income line" }),
    ).toBeInTheDocument();
  });
});
