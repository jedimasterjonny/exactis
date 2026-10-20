import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ProgressPoint } from "@/data/progress";

import { points as fixture } from "@/data/progress.fixture";

import { ProgressChart } from "./progress-chart";

// Fourteen months from November 2024 to December 2025, the pensions
// rising £1,000 a month over the property, the ISAs and a mortgage that
// stand still, and the cards owing £1,000; March 2025 was not kept, and
// in July 2025 the cards owed nothing.
const points = Array.from({ length: 14 }, (_, index): ProgressPoint => ({
  assets: 300000,
  deferred: 100000 + index * 1000,
  free: 50000,
  house: 300000,
  loans: -200000,
  month: {
    month: (10 + index) % 12,
    year: 2024 + Math.floor((10 + index) / 12),
  },
  unsecured: index === 8 ? 0 : -1000,
})).filter((_point, index) => index !== 4);

// Eight months of 2025 over the same balances, the first two read off
// the accounts with £100,000 of cash and £60,000 in GIAs, the next two
// off the sheet with neither, May not kept, June read off the accounts
// again, July not kept, and August's cash £20,000 more than June's.
const mixed = Array.from({ length: 8 }, (_, index): ProgressPoint => {
  const point = {
    assets: 300000,
    deferred: 100000,
    free: 50000,
    house: 300000,
    loans: -200000,
    month: { month: index, year: 2025 },
    unsecured: -1000,
  };
  if (index === 2 || index === 3) {
    return point;
  }
  return { ...point, cash: index === 7 ? 120000 : 100000, taxable: 60000 };
}).filter((_point, index) => index !== 4 && index !== 6);

// The twelve months of 2026 the plan carries net worth through from
// December 2025's £262,000, rising £50,000 a month to £862,000, past
// everything held.
const planned = Array.from({ length: 12 }, (_, index) => ({
  month: { month: index, year: 2026 },
  worth: 262000 + (index + 1) * 50000,
}));

// What recharts draws with the class given. Nothing it draws has a role
// or a label, so no query is more accessible than the class and none
// can be suggested.
function drawn(className: string): HTMLElement[] {
  return screen.queryAllByText(
    (_content, element) => element?.classList.contains(className) === true,
    { suggest: false },
  );
}

// The path a line is drawn along, net worth's or, dashed, the plan's.
function pathOf(isDashed: boolean): string {
  return (
    drawn("recharts-line-curve")
      .find((curve) => curve.hasAttribute("stroke-dasharray") === isDashed)
      ?.getAttribute("d") ?? ""
  );
}

// How many runs a series' line is drawn in, by the colour it is
// stroked in: one more than the breaks in it, each run its own move.
function runsOf(stroke: string): number | undefined {
  const moves = drawn("recharts-area-curve")
    .find((curve) => curve.getAttribute("stroke") === stroke)
    ?.getAttribute("d")
    ?.split("M").length;
  return moves === undefined ? undefined : moves - 1;
}

// Where along the plot each point of a path falls: the first figure of
// every pair its moves and curves are written in.
function xsOf(path: string): number[] {
  return path
    .split(/[,CLM]/)
    .filter((figure) => figure !== "")
    .filter((_figure, index) => index % 2 === 0)
    .map(Number);
}

describe("ProgressChart", () => {
  it("lays the points month by month, marking the years at each January", () => {
    render(<ProgressChart planned={[]} points={points} />);

    const card = screen.getByRole("region", { name: "Month by month" });

    expect(
      within(card).getByRole("application", {
        name: "What each balance stood at as each month ended",
      }),
    ).toHaveClass("recharts-surface");
    expect(
      drawn("recharts-cartesian-axis-tick-value")
        .map(({ textContent }) => textContent)
        .filter((text) => !text.includes("£")),
    ).toStrictEqual(["2025"]);
  });

  // March to August 2026 cross no January.
  it("marks each month by name over months that cross no January", () => {
    render(<ProgressChart planned={[]} points={fixture} />);

    expect(
      drawn("recharts-cartesian-axis-tick-value")
        .map(({ textContent }) => textContent)
        .filter((text) => !text.includes("£")),
    ).toStrictEqual([
      "Mar 2026",
      "Apr 2026",
      "May 2026",
      "Jun 2026",
      "Jul 2026",
      "Aug 2026",
    ]);
  });

  // March to August 2026 kept cross no January, so a plan running on to
  // August 2027 is marked month by month with them rather than by its
  // January alone, every other month here to keep the gap between them,
  // counted back from the last.
  it("marks every month by name, the plan's too, where the months kept cross no January", () => {
    render(
      <ProgressChart
        planned={Array.from({ length: 12 }, (_, index) => ({
          month: {
            month: (8 + index) % 12,
            year: 2026 + Math.floor((8 + index) / 12),
          },
          worth: 930000 + index * 5000,
        }))}
        points={fixture}
      />,
    );

    expect(
      drawn("recharts-cartesian-axis-tick-value")
        .map(({ textContent }) => textContent)
        .filter((text) => !text.includes("£")),
    ).toStrictEqual([
      "Apr 2026",
      "Jun 2026",
      "Aug 2026",
      "Oct 2026",
      "Dec 2026",
      "Feb 2027",
      "Apr 2027",
      "Jun 2027",
      "Aug 2027",
    ]);
  });

  // March 2025 is drawn between February and April, so every series
  // runs on through it, and only the cards break, in July, where they
  // owed nothing.
  it("draws a month not kept between the months either side, and breaks a debt where it owes nothing", () => {
    render(<ProgressChart planned={[]} points={points} />);

    expect(runsOf("var(--chart-2)")).toBe(1);
    expect(runsOf("var(--chart-5)")).toBe(1);
    expect(runsOf("var(--brand)")).toBe(2);
  });

  // The cash is drawn over January and February and again from June, and
  // breaks over the months the sheet gave and May, which is drawn
  // between April and June and so carries no cash, where July, between
  // June and August, carries it stepped between the two; and the pounds
  // reach as high as everything held, the cash and the GIAs among it.
  it("draws cash and the GIAs over the months whose points carry them, and nothing over the rest", async () => {
    render(<ProgressChart planned={[]} points={mixed} />);

    expect(runsOf("var(--chart-4)")).toBe(2);
    expect(runsOf("var(--chart-6)")).toBe(2);
    expect(runsOf("var(--chart-2)")).toBe(1);
    expect(
      drawn("recharts-cartesian-axis-tick-value")
        .map(({ textContent }) => textContent)
        .filter((text) => text.includes("£"))
        .at(-1),
    ).toBe("£800k");

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("May 2025")).toHaveClass("font-medium");
    expect(screen.getByRole("status")).toHaveTextContent(
      "May 2025Not kept, filled inProperty & vehicles£300,000Cash—GIAs—",
    );

    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("Jul 2025")).toHaveClass("font-medium");
    expect(screen.getByRole("status")).toHaveTextContent(
      [
        "Jul 2025",
        "Not kept, filled in",
        "Property & vehicles£300,000",
        "Cash£110,000",
        "GIAs£60,000",
        "ISAs£50,000",
        "Pensions£100,000",
        "Secured loans−£200,000",
        "Other debts−£1,000",
        "Net worth£419,000",
      ].join(""),
    );
  });

  // The crosshair moves on the arrow keys as it does under the pointer,
  // and recharts moves it a frame later.
  it("reads the month, each balance from the top of the stack down and net worth under the crosshair, saying where a month was not kept", async () => {
    render(<ProgressChart planned={[]} points={points} />);

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("Dec 2024")).toHaveClass("font-medium");
    expect(screen.getByRole("status")).toHaveTextContent(
      [
        "Dec 2024",
        "Property & vehicles£300,000",
        "Cash—",
        "GIAs—",
        "ISAs£50,000",
        "Pensions£101,000",
        "Secured loans−£200,000",
        "Other debts−£1,000",
        "Net worth£250,000",
      ].join(""),
    );

    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("Not kept, filled in")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      [
        "Mar 2025",
        "Not kept, filled in",
        "Property & vehicles£300,000",
        "Cash—",
        "GIAs—",
        "ISAs£50,000",
        "Pensions£104,000",
        "Secured loans−£200,000",
        "Other debts−£1,000",
        "Net worth£253,000",
      ].join(""),
    );
  });

  // The dash starts on the pixel net worth ends on, at December's mark,
  // and every balance stops there.
  it("draws the plan dashed from the latest point over the months planned, and no balance past it", () => {
    render(<ProgressChart planned={planned} points={points} />);

    const worth = pathOf(false);

    expect(pathOf(true).split("C")[0]).toBe(
      `M${worth.split(",").slice(-2).join(",")}`,
    );
    expect(drawn("recharts-reference-line-line")).toHaveLength(1);
    expect(
      drawn("recharts-label").map(({ textContent }) => textContent),
    ).toStrictEqual(["Dec 2025"]);
    expect(
      Math.max(
        ...drawn("recharts-area-curve").flatMap((curve) =>
          xsOf(curve.getAttribute("d") ?? ""),
        ),
      ),
    ).toBe(Math.max(...xsOf(worth)));
    expect(
      screen.getByRole("application", {
        name: "What each balance stood at as each month ended, and where the plan carries net worth over the year ahead",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Held above the rule, owed below, net worth between, and the plan dashed ahead",
      ),
    ).toBeInTheDocument();
  });

  // Everything held tops out at £463,000, which the axis would mark to
  // £500k; the plan's £862,000 takes it to £1m, and January 2026 is
  // marked beside January 2025.
  it("reaches the pounds as high as the plan does and marks the January of the year planned", () => {
    render(<ProgressChart planned={planned} points={points} />);

    const ticks = drawn("recharts-cartesian-axis-tick-value").map(
      ({ textContent }) => textContent,
    );

    expect(ticks.filter((text) => text.includes("£")).at(-1)).toBe("£1m");
    expect(ticks.filter((text) => !text.includes("£"))).toStrictEqual([
      "2025",
      "2026",
    ]);
  });

  // Fourteen months to December 2025, then January 2026, planned.
  it("reads a month planned as planned and its net worth alone under the crosshair", async () => {
    render(<ProgressChart planned={planned} points={points} />);

    const chart = screen.getByRole("application");
    chart.focus();
    for (let press = 0; press < 14; press += 1) {
      fireEvent.keyDown(chart, { key: "ArrowRight" });
    }

    expect(await screen.findByText("Jan 2026")).toHaveClass("font-medium");
    expect(screen.getByText("Planned, not yet kept")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Jan 2026Planned, not yet keptNet worth£312,000",
    );
  });

  it("draws no dash and no mark where nothing is planned", () => {
    render(<ProgressChart planned={[]} points={points} />);

    expect(drawn("recharts-line-curve")).toHaveLength(1);
    expect(drawn("recharts-reference-line-line")).toHaveLength(0);
  });
});
