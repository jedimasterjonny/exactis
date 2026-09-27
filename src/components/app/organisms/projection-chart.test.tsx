import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts, sipp } from "@/data/accounts.fixture";
import { bySlot } from "@/test/dom";

import { ProjectionChart, ProjectionPending } from "./projection-chart";

// recharts names the layer it draws each series in after the mark, which
// is what tells the plot's areas from its bars. A layer has no role,
// label or text, so no query is more accessible than this one and none
// can be suggested; the suggestion pass is told so, since it falls over
// on elements it can suggest nothing for.
const byClass =
  (className: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.classList.contains(className) === true;

// The reference plan's pension and ISA, which the points below hold by
// the ids they are listed under.
const [pension, isa, cash, home] = accounts;
const held: readonly Account[] = [pension, isa];

const points = [
  {
    age: 36,
    balances: { 1: 412880, 2: 286145 },
    deferred: 412880,
    early: 0,
    free: 286145,
    uncovered: 0,
    year: 2026,
  },
  {
    age: 37,
    balances: { 1: 462079, 2: 321452 },
    deferred: 462079,
    early: 0,
    free: 321452,
    uncovered: 0,
    year: 2027,
  },
  {
    age: 38,
    balances: { 1: 513737, 2: 358525 },
    deferred: 513737,
    early: 0,
    free: 358525,
    uncovered: 0,
    year: 2028,
  },
];

// The same plan, short from its second year on, so the mark has a year
// to fall on and a later short year to leave unmarked.
const shortPoints = [
  {
    age: 36,
    balances: { 1: 412880, 2: 286145 },
    deferred: 412880,
    early: 0,
    free: 286145,
    uncovered: 0,
    year: 2026,
  },
  {
    age: 37,
    balances: { 1: 41209, 2: 0 },
    deferred: 41209,
    early: 0,
    free: 0,
    uncovered: 18450,
    year: 2027,
  },
  {
    age: 38,
    balances: { 1: 0, 2: 0 },
    deferred: 0,
    early: 0,
    free: 0,
    uncovered: 52310,
    year: 2028,
  },
];

// The same plan with its pension drawn early in its second year, before
// it runs out in its third, so both marks have a year to fall on.
const earlyPoints = [
  {
    age: 36,
    balances: { 1: 412880, 2: 286145 },
    deferred: 412880,
    early: 0,
    free: 286145,
    uncovered: 0,
    year: 2026,
  },
  {
    age: 37,
    balances: { 1: 41209, 2: 0 },
    deferred: 41209,
    early: 26667,
    free: 0,
    uncovered: 0,
    year: 2027,
  },
  {
    age: 38,
    balances: { 1: 0, 2: 0 },
    deferred: 0,
    early: 0,
    free: 0,
    uncovered: 52310,
    year: 2028,
  },
];

// The vertical rule recharts draws for a ReferenceLine, which carries the
// year it stands at as an attribute.
const marks = (): HTMLElement[] =>
  screen.queryAllByText(byClass("recharts-reference-line-line"), {
    suggest: false,
  });

// The dot recharts draws for a ReferenceDot, which has no role, label or
// text either.
const dots = (): HTMLElement[] =>
  screen.queryAllByText(byClass("recharts-reference-dot-dot"), {
    suggest: false,
  });

// The colours the container writes for the series, into a style of its
// own. A style has no role or text a reader meets, so it is found as
// the element it is, which the queries skip unless told not to.
const colours = (): string =>
  screen.getByText((_content, element) => element?.tagName === "STYLE", {
    ignore: false,
    suggest: false,
  }).textContent;

describe("ProjectionChart", () => {
  it("plots the years with no legend, leaving the series to the crosshair to name", () => {
    render(<ProjectionChart accounts={held} milestones={[]} points={points} />);

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(screen.queryByText(pension.name)).not.toBeInTheDocument();
  });

  // The crosshair moves on the arrow keys as it does under the pointer,
  // and recharts moves it a frame later.
  it("shows the year, the age, each account's figure and the total under the crosshair", async () => {
    render(<ProjectionChart accounts={held} milestones={[]} points={points} />);

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 37")).toHaveClass("font-medium");

    const tooltip = within(screen.getByText(bySlot("projection-tooltip")));

    expect(tooltip.getByText(pension.name)).toBeInTheDocument();
    expect(tooltip.getByText(isa.name)).toBeInTheDocument();
    expect(tooltip.getByText("£462,079")).toHaveClass("figure");
    expect(tooltip.getByText("£321,452")).toHaveClass("figure");
    expect(tooltip.getByText("£783,531")).toHaveClass("figure");
    expect(tooltip.getByText("Total")).toBeInTheDocument();
  });

  // Two pensions, the ISA, the current account and the home, stacked
  // family by family from the baseline, the second pension receding
  // toward the card from the first, and named under the crosshair from
  // the top of the stack down. The mortgage is not drawn.
  it("draws each account on its own, family by family, and names each under the crosshair", async () => {
    const listed = [...accounts, sipp];
    const years = [2026, 2027].map((year, place) => ({
      age: 36 + place,
      balances: { 1: 1000, 2: 2000, 3: 300, 4: 400000, 5: -180000, 6: 600 },
      deferred: 1600,
      early: 0,
      free: 2000,
      uncovered: 0,
      year,
    }));
    render(
      <ProjectionChart accounts={listed} milestones={[]} points={years} />,
    );

    expect(
      screen
        .getAllByText(byClass("recharts-area-curve"), { suggest: false })
        .map((curve) => curve.getAttribute("stroke")),
    ).toStrictEqual(
      [1, 6, 2, 3, 4].map((id) => `var(--color-account-${String(id)})`),
    );
    expect(colours()).toContain(
      "--color-account-1: color-mix(in oklab, var(--chart-2), var(--card) 0%);",
    );
    expect(colours()).toContain(
      "--color-account-6: color-mix(in oklab, var(--chart-2), var(--card) 30%);",
    );
    expect(colours()).toContain(
      "--color-account-4: color-mix(in oklab, var(--chart-3), var(--card) 0%);",
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2027 · Age 37");

    const tooltip = within(screen.getByText(bySlot("projection-tooltip")));

    expect(
      tooltip
        .getAllByText(/^(Home|Current account|Stocks|SIPP|Workplace)/)
        .map((name) => name.textContent),
    ).toStrictEqual([home.name, cash.name, isa.name, sipp.name, pension.name]);
    expect(tooltip.getByText("£403,900")).toHaveClass("figure");
  });

  it("sets the caller's controls and choices beside the toggle, and none over nothing to plot", () => {
    const { rerender } = render(
      <ProjectionChart
        accounts={held}
        choices={<button type="button">A choice</button>}
        controls={<button type="button">A control</button>}
        milestones={[]}
        points={points}
      />,
    );

    expect(
      screen.getByRole("button", { name: "A control" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "A choice" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Areas" })).toBeInTheDocument();

    rerender(
      <ProjectionChart
        accounts={held}
        choices={<button type="button">A choice</button>}
        controls={<button type="button">A control</button>}
        milestones={[]}
        points={[]}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "A control" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "A choice" }),
    ).not.toBeInTheDocument();
  });

  it("swaps the areas for a column per year on the toggle, and back", () => {
    render(<ProjectionChart accounts={held} milestones={[]} points={points} />);

    expect(
      screen.getAllByText(byClass("recharts-area"), { suggest: false }),
    ).toHaveLength(2);

    const control = screen.getByRole("switch", { name: "Areas" });

    expect(control).not.toBeChecked();

    fireEvent.click(control);

    expect(screen.getByRole("switch", { name: "Bars" })).toBeChecked();
    expect(
      screen.getAllByText(byClass("recharts-bar"), { suggest: false }),
    ).toHaveLength(2);
    expect(
      screen.queryAllByText(byClass("recharts-area"), { suggest: false }),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("switch", { name: "Bars" }));

    expect(screen.getByRole("switch", { name: "Areas" })).not.toBeChecked();
    expect(
      screen.getAllByText(byClass("recharts-area"), { suggest: false }),
    ).toHaveLength(2);
    expect(
      screen.queryAllByText(byClass("recharts-bar"), { suggest: false }),
    ).toHaveLength(0);
  });

  it("marks no year and names nothing uncovered while the money lasts", async () => {
    render(<ProjectionChart accounts={held} milestones={[]} points={points} />);

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    await screen.findByText("2027 · Age 37");

    expect(marks()).toHaveLength(0);
    expect(screen.queryByText("Runs out")).not.toBeInTheDocument();
    expect(screen.queryByText("Early pension")).not.toBeInTheDocument();
    expect(screen.queryByText("Retirement")).not.toBeInTheDocument();
    expect(screen.queryByText("Uncovered")).not.toBeInTheDocument();
    expect(screen.queryByText("Drawn early")).not.toBeInTheDocument();
  });

  it("marks the first year a pension is drawn early apart from the year the money runs out", () => {
    render(
      <ProjectionChart accounts={held} milestones={[]} points={earlyPoints} />,
    );

    expect(marks().map((mark) => mark.getAttribute("x"))).toStrictEqual([
      "2027",
      "2028",
    ]);
    expect(screen.getByText("Early pension")).toBeInTheDocument();
    expect(screen.getByText("Runs out")).toBeInTheDocument();
  });

  // A milestone's line carries no name, so the warnings' labels are the
  // only words on the plot.
  it("marks a milestone beside the warnings in oxide, unnamed, under either mark", () => {
    render(
      <ProjectionChart
        accounts={held}
        milestones={[{ id: "retirement", name: "Retirement", year: 2026 }]}
        points={earlyPoints}
      />,
    );

    expect(marks().map((mark) => mark.getAttribute("x"))).toStrictEqual([
      "2026",
      "2027",
      "2028",
    ]);
    expect(marks()[0]).toHaveAttribute("stroke", "var(--brand)");
    expect(screen.queryByText("Retirement")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Areas" }));

    expect(marks().map((mark) => mark.getAttribute("x"))).toStrictEqual([
      "2026",
      "2027",
      "2028",
    ]);
  });

  it("names what a year drew early under the crosshair", async () => {
    render(
      <ProjectionChart accounts={held} milestones={[]} points={earlyPoints} />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 37")).toHaveClass("font-medium");

    const tooltip = within(screen.getByText(bySlot("projection-tooltip")));

    expect(tooltip.getByText("Drawn early")).toBeInTheDocument();
    expect(tooltip.getByText("£26,667")).toHaveClass(
      "figure",
      "font-medium",
      "text-caution",
    );
    expect(tooltip.queryByText("Uncovered")).not.toBeInTheDocument();
  });

  it("marks the first year the money runs out, and only that year", () => {
    render(
      <ProjectionChart accounts={held} milestones={[]} points={shortPoints} />,
    );

    expect(marks()).toHaveLength(1);
    expect(marks()[0]).toHaveAttribute("x", "2027");
    expect(screen.getByText("Runs out")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Areas" }));

    expect(marks()).toHaveLength(1);
    expect(marks()[0]).toHaveAttribute("x", "2027");
  });

  it("names what a short year could not cover under the crosshair", async () => {
    render(
      <ProjectionChart accounts={held} milestones={[]} points={shortPoints} />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 37")).toHaveClass("font-medium");

    const tooltip = within(screen.getByText(bySlot("projection-tooltip")));

    expect(tooltip.getByText("Uncovered")).toBeInTheDocument();
    expect(tooltip.getByText("£18,450")).toHaveClass(
      "figure",
      "font-medium",
      "text-destructive",
    );
  });

  it("says so instead of plotting nothing when the plan holds nothing", () => {
    render(
      <ProjectionChart
        accounts={held}
        milestones={[]}
        points={[
          {
            age: 36,
            balances: { 1: 0, 2: 0 },
            deferred: 0,
            early: 0,
            free: 0,
            uncovered: 0,
            year: 2026,
          },
          {
            age: 37,
            balances: { 1: 0, 2: 0 },
            deferred: 0,
            early: 0,
            free: 0,
            uncovered: 0,
            year: 2027,
          },
        ]}
      />,
    );

    expect(
      screen.getByText("Add an account or an asset to see it projected."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Accounts & assets" }),
    ).toHaveAttribute("href", "/accounts");
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("has nothing to plot over no years either", () => {
    render(<ProjectionChart accounts={held} milestones={[]} points={[]} />);

    expect(
      screen.getByText("Add an account or an asset to see it projected."),
    ).toBeInTheDocument();
  });

  // Fifteen years from 2026. Every milestone within them is marked, the
  // chosen one solid with a dot on the top of the stack where the
  // balance it is read at stands, the rest faint; one past them goes
  // undrawn. No milestone is named on the plot.
  it("marks every milestone in the plan's years, the chosen one solid with a dot where its balance stands", () => {
    const years = Array.from({ length: 15 }, (_, place) => ({
      age: 36 + place,
      balances: { 1: 100000, 2: 100000 },
      deferred: 100000,
      early: 0,
      free: 100000,
      uncovered: 0,
      year: 2026 + place,
    }));
    render(
      <ProjectionChart
        accounts={held}
        milestones={[
          { id: 1, name: "Kids leave home", year: 2026 },
          { id: "retirement", name: "Retirement", year: 2030 },
          { id: 5, name: "Care", year: 2060 },
        ]}
        points={years}
        selected="retirement"
      />,
    );

    expect(marks().map((mark) => mark.getAttribute("x"))).toStrictEqual([
      "2026",
      "2030",
    ]);
    expect(
      marks().map((mark) => mark.getAttribute("stroke-opacity")),
    ).toStrictEqual(["0.35", "1"]);
    expect(dots()).toHaveLength(1);
    expect(dots()[0]).toHaveAttribute("fill", "var(--brand)");
    expect(
      screen.queryByText(/^(Kids leave home|Retirement|Care)$/),
    ).not.toBeInTheDocument();
  });

  it("draws no dot for a choice the plan's years do not reach, nor for none", () => {
    const { rerender } = render(
      <ProjectionChart
        accounts={held}
        milestones={[{ id: 5, name: "Care", year: 2060 }]}
        points={points}
        selected={5}
      />,
    );

    expect(marks()).toHaveLength(0);
    expect(dots()).toHaveLength(0);

    rerender(
      <ProjectionChart
        accounts={held}
        milestones={[{ id: "retirement", name: "Retirement", year: 2027 }]}
        points={points}
      />,
    );

    expect(marks()).toHaveLength(1);
    expect(dots()).toHaveLength(0);
  });

  it("names the milestones falling in the year under the crosshair", async () => {
    render(
      <ProjectionChart
        accounts={held}
        milestones={[
          { id: "retirement", name: "Retirement", year: 2027 },
          { id: 2, name: "Sabbatical", year: 2027 },
        ]}
        points={points}
      />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2027 · Age 37");

    expect(
      within(screen.getByText(bySlot("projection-tooltip"))).getByText(
        "Retirement and Sabbatical",
      ),
    ).toHaveClass("text-muted-foreground");
  });
});

describe("ProjectionPending", () => {
  it("holds the chart's frame while the store answers", () => {
    render(<ProjectionPending />);

    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Reading the store…",
    );
  });
});
