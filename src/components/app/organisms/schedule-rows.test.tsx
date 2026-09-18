import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { IncomeLine } from "@/data/income";

import { totalOf } from "@/data/income";
import { incomeLines, plan } from "@/data/income.fixture";

import type { Summary } from "./schedule-rows";

import { ScheduleRows } from "./schedule-rows";

const bySlot =
  (slot: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.getAttribute("data-slot") === slot;

const [salary, , consulting, statePension] = incomeLines;

// What a schedule might say of a line: its kind as the badge, with a tone
// for one of them, the parts summed, and a detail for the line paid in
// parts.
function summarise(line: IncomeLine): Summary {
  return {
    badge: {
      label: line.kind,
      variant: line.kind === "pension" ? "caution" : "secondary",
    },
    ...(line.bonus > 0 && { detail: "Paid in parts" }),
    total: totalOf(line),
  };
}

describe("ScheduleRows", () => {
  it("lists every line with its badge, its detail, its figure, growth, years and ages", () => {
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={incomeLines}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(incomeLines.length);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Salary")).toHaveClass("font-medium");
    expect(screen.getAllByText("employment")).toHaveLength(2);
    expect(screen.getByText("pension")).toHaveAttribute(
      "data-variant",
      "caution",
    );
    expect(screen.getByText("self-employment")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(screen.getAllByText("Paid in parts")).toHaveLength(1);
    expect(screen.getByText("Paid in parts")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.getByText("£147,000")).toHaveClass("figure");
    expect(screen.getByText("£147,000")).toHaveTextContent("£147,000 / yr");
    expect(screen.getByText("£2,000")).toHaveTextContent("£2,000 / mo");
    expect(screen.getByText("Inflation +1%")).toBeInTheDocument();
    expect(screen.getByText("Nominal, fixed")).toBeInTheDocument();
    expect(screen.getByText("2026 – 2048")).toHaveClass("figure");
    expect(screen.getByText("Age 36–58")).toHaveClass("label");
    expect(screen.getByText("2058 – end")).toBeInTheDocument();
    expect(screen.getByText("Age 68–89")).toBeInTheDocument();
  });

  // A line that ends part way through its last year names the month,
  // while the ages stay whole years.
  it("names the month a line ends in when it ends part way through a year", () => {
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[{ ...salary, lastMonth: 10 }]}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    expect(screen.getByText("2026 – Nov 2048")).toHaveClass("figure");
    expect(screen.getByText("Age 36–58")).toBeInTheDocument();
  });

  it("draws each side's bars in its own colour", () => {
    const { rerender } = render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[consulting]}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveClass("bg-chart-2");

    rerender(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[statePension]}
        plan={plan}
        side="expense"
        summarise={summarise}
      />,
    );

    expect(screen.getByText(bySlot("span-bar-fill"))).toHaveClass("bg-chart-5");
  });

  it("draws its empty state rather than a list of nothing, on either side", () => {
    const { rerender } = render(
      <ScheduleRows
        emptyDescription="Add a salary to see it scheduled here."
        emptyTitle="No income yet"
        lines={[]}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.getByText("No income yet")).toBeInTheDocument();
    expect(
      screen.getByText("Add a salary to see it scheduled here."),
    ).toBeInTheDocument();

    rerender(
      <ScheduleRows
        emptyDescription="Add the household's spending."
        emptyTitle="No expenses yet"
        lines={[]}
        plan={plan}
        side="expense"
        summarise={summarise}
      />,
    );

    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
  });

  it("closes each row with a pencil when given an edit handler", () => {
    const onEdit = vi.fn<(line: IncomeLine) => void>();
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={incomeLines}
        onEdit={onEdit}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(
      incomeLines.length,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Salary" }));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(salary);
  });

  // A line the schedule locks draws a lock where its pencil would be,
  // saying why, and the others keep theirs.
  it("locks a line the schedule says is locked, with the reason", () => {
    const onEdit = vi.fn<(line: IncomeLine) => void>();
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[salary, statePension]}
        onEdit={onEdit}
        plan={plan}
        side="income"
        summarise={(line) => ({
          ...summarise(line),
          ...(line.kind === "pension" && { lock: "Set by the state" }),
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Edit Salary" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Edit State pension" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Set by the state" })).toHaveClass(
      "text-muted-foreground/60",
    );
  });
});
