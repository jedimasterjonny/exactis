import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { IncomeLine } from "@/data/income";

import { totalOf } from "@/data/income";
import { incomeLines, plan } from "@/data/income.fixture";
import { bySlot } from "@/test/dom";

import type { Summary } from "./schedule-rows";

import { ScheduleRows } from "./schedule-rows";

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
    // Every row is drawn in its columns and again in its folded lines,
    // only one of which is on screen at any width, so the name and the
    // detail are found twice, the columns' copy after the lines'.
    for (const name of screen.getAllByText("Salary")) {
      expect(name).toHaveClass("font-medium");
    }
    expect(screen.getAllByText("employment")).toHaveLength(2);
    expect(screen.getByText("pension")).toHaveAttribute(
      "data-variant",
      "caution",
    );
    expect(screen.getByText("self-employment")).toHaveAttribute(
      "data-variant",
      "secondary",
    );
    expect(screen.getAllByText("Paid in parts")).toHaveLength(2);
    expect(screen.getAllByText("Paid in parts").at(-1)).toHaveClass(
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

    // The bar is drawn in the row's columns and across its folded lines.
    // The bars are hidden from the accessibility tree, so no query is
    // better than the slot, and the suggestion to find one is off.
    for (const fill of screen.getAllByText(bySlot("span-bar-fill"), {
      suggest: false,
    })) {
      expect(fill).toHaveClass("bg-chart-2");
    }

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

    for (const fill of screen.getAllByText(bySlot("span-bar-fill"), {
      suggest: false,
    })) {
      expect(fill).toHaveClass("bg-chart-5");
    }
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

  it("closes each row with a pencil and a bin when given both handlers", () => {
    const onDelete = vi.fn<(line: IncomeLine) => void>();
    const onEdit = vi.fn<(line: IncomeLine) => void>();
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={incomeLines}
        onDelete={onDelete}
        onEdit={onEdit}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    expect(screen.getAllByRole("button", { name: /^Edit / })).toHaveLength(
      incomeLines.length,
    );
    expect(screen.getAllByRole("button", { name: /^Delete / })).toHaveLength(
      incomeLines.length,
    );
    expect(screen.getByRole("button", { name: "Delete Salary" })).toHaveClass(
      "hover:text-destructive",
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Salary" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Salary" }));

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(salary);
    expect(onDelete).toHaveBeenCalledExactlyOnceWith(salary);
  });

  it("draws the column for either handler alone", () => {
    const onDelete = vi.fn<(line: IncomeLine) => void>();
    const { unmount } = render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[salary]}
        onDelete={onDelete}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Edit Salary" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Delete Salary" }));

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(salary);

    unmount();
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[salary]}
        onEdit={vi.fn<(line: IncomeLine) => void>()}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    expect(screen.getByRole("button", { name: "Edit Salary" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "Delete Salary" }),
    ).not.toBeInTheDocument();
  });

  // A line the schedule locks draws a lock where its pencil and bin
  // would be, saying why, and the others keep theirs.
  it("locks a line the schedule says is locked, with the reason", () => {
    const onEdit = vi.fn<(line: IncomeLine) => void>();
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[salary, statePension]}
        onDelete={vi.fn<(line: IncomeLine) => void>()}
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
    expect(
      screen.queryByRole("button", { name: "Delete State pension" }),
    ).not.toBeInTheDocument();
    // The lock is drawn where the pencil and the bin would be, and where
    // the chevron would be on the folded lines, which open nothing.
    const locks = screen.getAllByRole("img", { name: "Set by the state" });

    expect(locks).toHaveLength(2);
    for (const lock of locks) {
      expect(lock).toHaveClass("text-muted-foreground/60");
    }
    expect(
      screen.queryByRole("button", { name: "State pension" }),
    ).not.toBeInTheDocument();
  });

  // Narrow, each row is its folded lines: the name and what it pays,
  // its kind and how it grows, its detail, the bar and its years. The
  // columns hide while they show, the row is one column, and it opens
  // from anywhere on it; its actions fold away with the columns, the
  // dialog it opens being where it is deleted from.
  it("folds each row into lines while narrow, opened from its name, its actions folded away", () => {
    const onEdit = vi.fn<(line: IncomeLine) => void>();
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[salary]}
        onDelete={vi.fn<(line: IncomeLine) => void>()}
        onEdit={onEdit}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    const item = screen.getByRole("listitem");
    const open = within(item).getByRole("button", { name: "Salary" });
    // eslint-disable-next-line testing-library/no-node-access -- the row's boxes are layout boxes with no role of their own; the folded lines' is the first
    const [folded, ...columns] = Array.from(item.children);

    expect(screen.getByRole("list")).toHaveClass("@container");
    expect(item).toHaveClass("relative", "folded:grid-cols-1");
    expect(folded).toHaveClass("unfolded:hidden");
    expect(folded).toContainElement(open);
    expect(columns).toHaveLength(4);
    for (const column of columns) {
      expect(column).toHaveClass("folded:hidden");
    }
    expect(within(item).getByText("£147,000 / yr")).toHaveClass("figure");
    expect(
      within(item).getByText("employment · Inflation +1%"),
    ).toBeInTheDocument();
    expect(within(item).getByText("2026 – 2048 · Age 36–58")).toBeVisible();
    // The bar is positioned and would lie over the button that covers
    // the row, so it lets a tap through to it. The folded lines' bar is
    // the row's first.
    const [foldedBar] = within(item).getAllByText(bySlot("span-bar"), {
      suggest: false,
    });

    // eslint-disable-next-line testing-library/no-node-access -- the box the bar sits in is a layout box with no role of its own
    expect(foldedBar?.parentElement).toHaveClass("pointer-events-none");

    fireEvent.click(open);

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(salary);
  });

  // A schedule given no edit handler has no dialog to send a bin to, so
  // its row keeps its bin while folded, and opens nothing.
  it("keeps a bin on a folded row that cannot open", () => {
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[salary]}
        onDelete={vi.fn<(line: IncomeLine) => void>()}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    const bin = screen.getByRole("button", { name: "Delete Salary" });

    expect(
      screen.queryByRole("button", { name: "Salary" }),
    ).not.toBeInTheDocument();
    // eslint-disable-next-line testing-library/no-node-access -- the actions' box is a layout box with no role of its own
    expect(bin.parentElement?.parentElement).not.toHaveClass("folded:hidden");
  });

  // A locked row given only a delete handler keeps its lock on the
  // folded lines and folds the column's away, so the lock is drawn once
  // at either width rather than twice while folded.
  it("draws a locked row's lock once while folded, with only a delete handler", () => {
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[statePension]}
        onDelete={vi.fn<(line: IncomeLine) => void>()}
        plan={plan}
        side="income"
        summarise={(line) => ({ ...summarise(line), lock: "Set by the state" })}
      />,
    );

    const [folded, column] = screen.getAllByRole("img", {
      name: "Set by the state",
    });

    // eslint-disable-next-line testing-library/no-node-access -- the boxes the locks sit in are layout boxes with no role of their own
    expect(folded?.closest(".unfolded\\:hidden")).not.toBeNull();
    // eslint-disable-next-line testing-library/no-node-access -- the boxes the locks sit in are layout boxes with no role of their own
    expect(column?.parentElement?.parentElement).toHaveClass("folded:hidden");
  });
});
