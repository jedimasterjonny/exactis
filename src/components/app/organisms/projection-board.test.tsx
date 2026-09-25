import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { incomeLines, plan } from "@/data/income.fixture";

import { ProjectionBoard } from "./projection-board";

const schedule = { expenses: expenseLines, income: incomeLines };

// The vertical rule recharts draws for a ReferenceLine, which carries the
// year it stands at as an attribute. A rule has no role, label or text,
// so no query is more accessible than this one and none can be
// suggested.
const marks = (): HTMLElement[] =>
  screen.queryAllByText(
    (_content, element) =>
      element?.classList.contains("recharts-reference-line-line") === true,
    { suggest: false },
  );

describe("ProjectionBoard", () => {
  // Born in 1990 and retiring at 59, the plan's owner retires in 2049,
  // which falls within the fixture's plan to 2079 and is marked there.
  it("charts the engine's projection of what it is handed, marked where its owner retires", () => {
    render(
      <ProjectionBoard
        accounts={accounts}
        plan={{ ...plan, retires: 59 }}
        schedule={schedule}
      />,
    );

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(screen.getByText("Retirement")).toBeInTheDocument();
    expect(marks().map((mark) => mark.getAttribute("x"))).toContain("2049");
  });

  it("projects nothing to chart without a wrapper", () => {
    render(<ProjectionBoard accounts={[]} plan={plan} schedule={schedule} />);

    expect(screen.getByText("Nothing to project yet")).toBeInTheDocument();
  });
});
