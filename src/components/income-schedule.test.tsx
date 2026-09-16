import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { incomeLines, plan } from "@/data/income.fixture";

import { IncomeSchedule } from "./income-schedule";

const [salary] = incomeLines;

describe("IncomeSchedule", () => {
  it("opens with the card, its rows and its note", () => {
    render(<IncomeSchedule lines={incomeLines} plan={plan} />);

    expect(screen.getByText("Sect. III.i")).toHaveClass("label");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Income by year",
    );
    expect(
      screen.getByRole("button", { name: "Add income line" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(incomeLines.length);
    expect(
      screen.queryByRole("button", { name: /^Edit / }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("£147,000")).toHaveTextContent("£147,000 / yr");
    expect(
      screen.getByText("£120,000 base · £15,000 bonus · £12,000 RSUs"),
    ).toHaveClass("text-muted-foreground");
    expect(screen.queryByText(/£168,000 base/)).not.toBeInTheDocument();
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Lines overlap freely",
    );
  });

  it("names only the parts a line has beyond its base", () => {
    render(
      <IncomeSchedule
        lines={[
          { ...salary, bonus: 0, id: 5 },
          { ...salary, id: 6, rsu: 0 },
        ]}
        plan={plan}
      />,
    );

    expect(screen.getByText("£120,000 base · £12,000 RSUs")).toBeVisible();
    expect(screen.getByText("£120,000 base · £15,000 bonus")).toBeVisible();
    expect(screen.getByText("£132,000")).toHaveTextContent("£132,000 / yr");
    expect(screen.getByText("£135,000")).toHaveTextContent("£135,000 / yr");
  });

  it("draws the empty state for none", () => {
    render(<IncomeSchedule lines={[]} plan={plan} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("No income yet")).toBeInTheDocument();
  });
});
