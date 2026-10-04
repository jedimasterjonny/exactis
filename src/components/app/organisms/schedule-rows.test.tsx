import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { IncomeLine } from "@/data/income";

import { totalOf } from "@/data/income";
import { incomeLines, plan, retiring } from "@/data/income.fixture";
import { markersOf } from "@/data/milestones";
import { milestones } from "@/data/milestones.fixture";
import { laneColumns } from "@/lib/span";
import { bySlot, pressRow } from "@/test/dom";

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
        milestones={[]}
        onEdit={vi.fn<(line: IncomeLine) => void>()}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(incomeLines.length);
    // Every row is drawn in its columns and again in its folded lines,
    // only one of which is on screen at any width, so the name and the
    // detail are found twice, the columns' copy after the lines'.
    for (const name of screen.getAllByRole("button", { name: "Salary" })) {
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
    expect(screen.getByText("Rises 1% over inflation")).toBeInTheDocument();
    expect(screen.getByText("Fixed in pounds")).toBeInTheDocument();
    expect(screen.getByText("2026 – 2048")).toHaveClass("figure");
    expect(screen.getByText("Age 36–58")).toHaveClass("label");
    expect(screen.getByText("2058 – end")).toBeInTheDocument();
    expect(screen.getByText("Age 68–89")).toBeInTheDocument();
    // Laid out in the milestones' columns, so each bar is as wide as
    // every other on the screen.
    for (const row of screen.getAllByRole("listitem")) {
      expect(row).toHaveClass(laneColumns);
    }
  });

  // A line that ends part way through its last year names the month,
  // while the ages stay whole years.
  it("names the month a line ends in when it ends part way through a year", () => {
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[{ ...salary, lastMonth: 10 }]}
        milestones={[]}
        onEdit={vi.fn<(line: IncomeLine) => void>()}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    expect(screen.getByText("2026 – Nov 2048")).toHaveClass("figure");
    expect(screen.getByText("Age 36–58")).toBeInTheDocument();
  });

  // The schedule says the salary is paid to 2045, as it would of one
  // its owner retires from in 2046, so the row draws it to there, tied
  // to retirement, while the row still opens the line as it is.
  it("draws a line as its schedule says it is paid, and opens it as it is", () => {
    const onEdit = vi.fn<(line: IncomeLine) => void>();
    const open = { ...salary, lastYear: null };
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[open]}
        milestones={markersOf([], retiring)}
        onEdit={onEdit}
        plan={plan}
        side="income"
        summarise={(line) => ({
          ...summarise(line),
          paid: { ...line, endsAt: "retirement", lastYear: 2045 },
        })}
      />,
    );

    expect(screen.getByText("2026 – 2045")).toHaveClass("figure");
    expect(screen.getByText("Age 36–55")).toBeInTheDocument();
    expect(screen.getAllByText("Until Retirement")).toHaveLength(2);
    expect(
      screen.getAllByText(bySlot("span-bar-tie"), { suggest: false }),
    ).toHaveLength(2);

    pressRow("Salary");

    expect(onEdit).toHaveBeenCalledWith(open);
  });

  it("draws each side's bars in its own colour", () => {
    const { rerender } = render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[consulting]}
        milestones={[]}
        onEdit={vi.fn<(line: IncomeLine) => void>()}
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
        milestones={[]}
        onEdit={vi.fn<(line: IncomeLine) => void>()}
        plan={plan}
        side="expense"
        summarise={summarise}
      />,
    );

    for (const fill of screen.getAllByText(bySlot("span-bar-fill"), {
      suggest: false,
    })) {
      expect(fill).toHaveClass("bg-foreground/50");
    }

    // A line its schedule says is a loan's payments is drawn in red.
    rerender(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[statePension]}
        milestones={[]}
        onEdit={vi.fn<(line: IncomeLine) => void>()}
        plan={plan}
        side="expense"
        summarise={(line) => ({ ...summarise(line), isLoan: true })}
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
        milestones={[]}
        onEdit={vi.fn<(line: IncomeLine) => void>()}
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
        milestones={[]}
        onEdit={vi.fn<(line: IncomeLine) => void>()}
        plan={plan}
        side="expense"
        summarise={summarise}
      />,
    );

    expect(screen.getByText("No expenses yet")).toBeInTheDocument();
  });

  // Laid out in columns, a row's name is the button that opens it, its
  // press covering the row, as on its folded lines, and a chevron closes
  // the row where a pencil and a bin once stood; the dialog it opens is
  // where it is deleted from. The bar is positioned and would lie over
  // the press, so it lets a click through to it.
  it("opens a row in columns from its name, with a chevron at its end", () => {
    const onEdit = vi.fn<(line: IncomeLine) => void>();
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[salary]}
        milestones={[]}
        onEdit={onEdit}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    const item = screen.getByRole("listitem");
    // eslint-disable-next-line testing-library/no-node-access -- the row's boxes are layout boxes with no role of their own; the columns' name and bar are the second, the chevron's the last
    const [, columns, , , end] = item.children;
    const opens = within(item).getAllByRole("button", { name: "Salary" });

    expect(opens).toHaveLength(2);
    expect(columns).toContainElement(opens.at(-1) ?? null);
    for (const open of opens) {
      expect(open).toHaveClass("after:absolute", "after:inset-0");
    }
    expect(
      screen.queryByRole("button", { name: /^(Edit|Delete) / }),
    ).not.toBeInTheDocument();
    expect(end).toHaveClass("size-7", "folded:hidden");
    // eslint-disable-next-line testing-library/no-node-access -- the chevron is an icon hidden from the tree, with no role or text of its own
    expect(end?.querySelector("svg")).toHaveClass("lucide-chevron-right");
    const bar = within(item)
      .getAllByText(bySlot("span-bar"), { suggest: false })
      .at(-1);

    // eslint-disable-next-line testing-library/no-node-access -- the box the bar sits in is a layout box with no role of its own
    expect(bar?.parentElement).toHaveClass("pointer-events-none");

    for (const open of opens) {
      fireEvent.click(open);
    }

    expect(onEdit.mock.calls).toStrictEqual([[salary], [salary]]);
  });

  // A line the schedule locks draws a lock where its chevron would be,
  // saying why, and opens nothing; the others open as ever.
  it("locks a line the schedule says is locked, with the reason", () => {
    const onEdit = vi.fn<(line: IncomeLine) => void>();
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[salary, statePension]}
        milestones={[]}
        onEdit={onEdit}
        plan={plan}
        side="income"
        summarise={(line) => ({
          ...summarise(line),
          ...(line.kind === "pension" && {
            lock: { at: "/accounts", reason: "Set by the state" },
          }),
        })}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Salary" })).toHaveLength(2);
    // The lock is drawn where the chevron would be, in the columns and on
    // the folded lines alike, and the name links to the screen the line
    // is set on rather than opening it here.
    const locks = screen.getAllByRole("img", { name: "Set by the state" });

    expect(locks).toHaveLength(2);
    for (const lock of locks) {
      expect(lock).toHaveClass("text-muted-foreground/60");
    }
    expect(
      screen.queryByRole("button", { name: "State pension" }),
    ).not.toBeInTheDocument();
    for (const link of screen.getAllByRole("link", { name: "State pension" })) {
      expect(link).toHaveAttribute("href", "/accounts");
    }
    expect(onEdit).not.toHaveBeenCalled();
  });

  // Narrow, each row is its folded lines: the name and what it pays,
  // its kind and how it grows, its detail, the bar and its years. The
  // columns hide while they show, the row is one column, and it opens
  // from anywhere on it, the dialog it opens being where it is deleted
  // from.
  it("folds each row into lines while narrow, opened from its name", () => {
    const onEdit = vi.fn<(line: IncomeLine) => void>();
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[salary]}
        milestones={[]}
        onEdit={onEdit}
        plan={plan}
        side="income"
        summarise={summarise}
      />,
    );

    const item = screen.getByRole("listitem");
    // eslint-disable-next-line testing-library/no-node-access -- the row's boxes are layout boxes with no role of their own; the folded lines' is the first
    const [folded, ...columns] = item.children;

    expect(screen.getByRole("list")).toHaveClass("@container");
    expect(item).toHaveClass("relative", "folded:grid-cols-1");
    expect(folded).toHaveClass("unfolded:hidden");
    expect(folded).toContainElement(
      within(item).getAllByRole("button", { name: "Salary" }).at(0) ?? null,
    );
    expect(columns).toHaveLength(4);
    for (const column of columns) {
      expect(column).toHaveClass("folded:hidden");
    }
    expect(within(item).getByText("£147,000 / yr")).toHaveClass("figure");
    expect(
      within(item).getByText("employment · Rises 1% over inflation"),
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

    pressRow("Salary", item);

    expect(onEdit).toHaveBeenCalledExactlyOnceWith(salary);
  });

  // A locked row keeps its lock on the folded lines and folds the
  // column's away, so the lock is drawn once at either width rather than
  // twice while folded.
  it("draws a locked row's lock once while folded", () => {
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[statePension]}
        milestones={[]}
        onEdit={vi.fn<(line: IncomeLine) => void>()}
        plan={plan}
        side="income"
        summarise={(line) => ({
          ...summarise(line),
          lock: { at: "/accounts", reason: "Set by the state" },
        })}
      />,
    );

    const [folded, column] = screen.getAllByRole("img", {
      name: "Set by the state",
    });

    // eslint-disable-next-line testing-library/no-node-access -- the boxes the locks sit in are layout boxes with no role of their own
    expect(folded?.closest(".unfolded\\:hidden")).not.toBeNull();
    // eslint-disable-next-line testing-library/no-node-access -- the boxes the locks sit in are layout boxes with no role of their own
    expect(column?.parentElement).toHaveClass("folded:hidden");
  });

  // Retirement at 59 falls in 2049 and the downsize in 2055. A salary
  // tied to end at retirement runs to 2048 and says so beside its
  // badge, as a line tied at both ends does, each tied end dotted on its
  // bar; a line whose milestone has moved past its other end runs no
  // years.
  it("names the milestones a line is tied to, and says when they leave it no years", () => {
    render(
      <ScheduleRows
        emptyDescription="Add one."
        emptyTitle="Nothing yet"
        lines={[
          { ...salary, endsAt: "retirement", lastYear: 2048 },
          {
            ...salary,
            endsAfter: 3,
            endsAt: "retirement",
            id: 6,
            lastYear: 2051,
          },
          {
            ...consulting,
            endsAfter: 1,
            endsAt: 2,
            firstYear: 2049,
            lastYear: 2054,
            startsAt: "retirement",
          },
          { ...statePension, firstYear: 2058, startsAt: 2 },
          {
            ...consulting,
            firstYear: 2049,
            id: 5,
            lastYear: 2040,
            startsAt: "retirement",
          },
        ]}
        milestones={markersOf(milestones, retiring)}
        onEdit={vi.fn<(line: IncomeLine) => void>()}
        plan={retiring}
        side="income"
        summarise={summarise}
      />,
    );

    // Each row says it twice, in its columns and on its folded lines.
    expect(screen.getAllByText("Until Retirement")).toHaveLength(2);
    expect(screen.getAllByText("Until 3 years after Retirement")).toHaveLength(
      2,
    );
    expect(
      screen.getAllByText("Retirement to 1 year after Downsize"),
    ).toHaveLength(2);
    expect(screen.getAllByText("From Downsize")).toHaveLength(2);
    expect(screen.getAllByText("From Retirement")).toHaveLength(2);
    expect(screen.getByText("2026 – 2048")).toHaveClass("figure");
    expect(screen.getByText("Age 36–58")).toBeInTheDocument();
    expect(screen.getByText("Runs no years")).toHaveClass("label");
    // Every bar rules the three milestones across its track: five lines,
    // each drawn twice.
    expect(
      screen.getAllByText(bySlot("span-bar-mark"), { suggest: false }),
    ).toHaveLength(30);
    // Hidden from the tree, so no query is better than the slot. Six
    // tied ends, each drawn on the row's two bars.
    expect(
      screen.getAllByText(bySlot("span-bar-tie"), { suggest: false }),
    ).toHaveLength(12);
  });
});
