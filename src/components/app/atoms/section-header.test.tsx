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
    expect(screen.getByRole("heading", { level: 2 })).not.toHaveAttribute("id");
  });

  it("gives the heading the id it is given, for a card to be named by", () => {
    render(<SectionHeader id="savings" label="Sect. II.i" title="Accounts" />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute(
      "id",
      "savings",
    );
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
