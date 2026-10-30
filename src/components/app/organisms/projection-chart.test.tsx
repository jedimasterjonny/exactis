import type { JSX } from "react";
import type { BarProps } from "recharts";

import { fireEvent, render, screen, within } from "@testing-library/react";
import { Bar } from "recharts";
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { ProjectionPoint } from "@/engine/projection";

import { accounts, sipp } from "@/data/accounts.fixture";
import { kept } from "@/data/household.fixture";
import { retiring } from "@/data/income.fixture";
import { owners } from "@/data/owners.fixture";
import { measuredOf, project } from "@/engine/projection";
import { formatGbp } from "@/lib/money";
import { lumpSumAllowance } from "@/lib/tax";

import { ProjectionChart, ProjectionPending } from "./projection-chart";

// recharts' column as it is, watched, so a test can tell what each
// column is handed.
vi.mock(import("recharts"), async (importOriginal) => {
  const recharts = await importOriginal();
  return {
    ...recharts,
    // eslint-disable-next-line @typescript-eslint/naming-convention -- the mock factory's key mirrors the component's name
    Bar: vi.fn((props: BarProps): JSX.Element => <recharts.Bar {...props} />),
  };
});

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
const [pension, isa, cash, home, mortgage] = accounts;
const held: readonly Account[] = [pension, isa];

// The plan the points are counted against: the fixture's owner, born
// early enough to draw a pension all through every year here, so a
// pension counts on the liquidity as on the net worth in every test but
// the one on the year it starts to.
const drawing = { owners: [{ ...owners[0], born: 1960 }] };

const points = [
  {
    age: 34,
    allowances: { 1: lumpSumAllowance },
    balances: { 2: 271930, 6: 391640 },
    deferred: 391640,
    early: 0,
    free: 271930,
    uncovered: 0,
    year: 2026,
  },
  {
    age: 35,
    allowances: { 1: lumpSumAllowance },
    balances: { 2: 305483, 6: 438308 },
    deferred: 438308,
    early: 0,
    free: 305483,
    uncovered: 0,
    year: 2027,
  },
  {
    age: 36,
    allowances: { 1: lumpSumAllowance },
    balances: { 2: 340714, 6: 487309 },
    deferred: 487309,
    early: 0,
    free: 340714,
    uncovered: 0,
    year: 2028,
  },
];

// The same plan, short from its second year on, so the mark has a year
// to fall on and a later short year to leave unmarked.
const shortPoints = [
  {
    age: 34,
    allowances: { 1: lumpSumAllowance },
    balances: { 2: 271930, 6: 391640 },
    deferred: 391640,
    early: 0,
    free: 271930,
    uncovered: 0,
    year: 2026,
  },
  {
    age: 35,
    allowances: { 1: lumpSumAllowance },
    balances: { 2: 0, 6: 41209 },
    deferred: 41209,
    early: 0,
    free: 0,
    uncovered: 18450,
    year: 2027,
  },
  {
    age: 36,
    allowances: { 1: lumpSumAllowance },
    balances: { 2: 0, 6: 0 },
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
    age: 34,
    allowances: { 1: lumpSumAllowance },
    balances: { 2: 271930, 6: 391640 },
    deferred: 391640,
    early: 0,
    free: 271930,
    uncovered: 0,
    year: 2026,
  },
  {
    age: 35,
    allowances: { 1: lumpSumAllowance },
    balances: { 2: 0, 6: 41209 },
    deferred: 41209,
    early: 26667,
    free: 0,
    uncovered: 0,
    year: 2027,
  },
  {
    age: 36,
    allowances: { 1: lumpSumAllowance },
    balances: { 2: 0, 6: 0 },
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

// The pounds the axis marks, in its own ticks rather than wherever a
// pound is written: recharts measures a label in a span of its own,
// which outlives the chart it measured for.
const pounds = (): string[] =>
  screen
    .getAllByText(byClass("recharts-cartesian-axis-tick-value"), {
      suggest: false,
    })
    .map((tick) => tick.textContent)
    .filter((tick) => tick.includes("£"));

// The names under the crosshair of the ISA, and of a flat and what is
// secured on it, in the order they are drawn.
const flatNames = (): (null | string)[] =>
  within(screen.getByRole("status"))
    .getAllByText(/^(Stocks|Flat)/)
    .map((name) => name.textContent);

describe("ProjectionChart", () => {
  it("plots the years with no legend, leaving the series to the crosshair to name", () => {
    render(
      <ProjectionChart
        accounts={held}
        milestones={[]}
        plan={drawing}
        points={points}
      />,
    );

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(screen.queryByText(pension.name)).not.toBeInTheDocument();
  });

  // The crosshair moves on the arrow keys as it does under the pointer,
  // and recharts moves it a frame later. The pension's £438,308 is
  // written at the £372,562 drawing it would leave, 85% of it.
  it("shows the year, the age, the figure of each account holding anything and the total under the crosshair", async () => {
    render(
      <ProjectionChart
        accounts={[...held, { ...sipp, owner: pension.owner }]}
        milestones={[]}
        plan={drawing}
        points={points}
      />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 35")).toHaveClass("font-medium");

    const tooltip = within(screen.getByRole("status"));

    expect(tooltip.getByText(pension.name)).toBeInTheDocument();
    expect(tooltip.getByText(isa.name)).toBeInTheDocument();
    expect(tooltip.queryByText(sipp.name)).not.toBeInTheDocument();
    expect(tooltip.getByText("£372,562")).toHaveClass("figure");
    expect(tooltip.getByText("£305,483")).toHaveClass("figure");
    expect(tooltip.getByText("£678,045")).toHaveClass("figure");
    expect(tooltip.getByText("Liquidity")).toBeInTheDocument();
  });

  // Cash is given no line of its own under the crosshair, but is still
  // counted in what the accounts come to.
  it("leaves cash out of the figures under the crosshair and counts it in the total", async () => {
    const withCash = points.map((point) => ({
      ...point,
      balances: { ...point.balances, 3: 10000 },
    }));
    render(
      <ProjectionChart
        accounts={[...held, cash]}
        milestones={[]}
        plan={drawing}
        points={withCash}
      />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2027 · Age 35");

    const tooltip = within(screen.getByRole("status"));

    expect(tooltip.queryByText(cash.name)).not.toBeInTheDocument();
    expect(tooltip.getByText("£688,045")).toHaveClass("figure");
  });

  // A GIA is stacked between the ISA and the cash in the slate kept
  // for it, and is named under the crosshair, as the cash is not.
  it("stacks a GIA between the ISA and the cash in its own colour, and names it under the crosshair", async () => {
    const gia: Account = {
      balance: 10000,
      growth: { kind: "plan" },
      id: 7,
      kind: "taxable",
      name: "Dealing account",
    };
    const withGia = points.map((point) => ({
      ...point,
      balances: { ...point.balances, 3: 300, 7: 10000 },
    }));
    render(
      <ProjectionChart
        accounts={[...held, cash, gia]}
        milestones={[]}
        plan={drawing}
        points={withGia}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Bars" }));

    expect(
      screen
        .getAllByText(byClass("recharts-area-curve"), { suggest: false })
        .map((curve) => curve.getAttribute("stroke")),
    ).toStrictEqual(
      [6, 2, 7, 3].map((id) => `var(--color-account-${String(id)})`),
    );
    expect(colours()).toContain(
      "--color-account-7: color-mix(in oklab, var(--chart-6), var(--card) 0%);",
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2027 · Age 35");

    const tooltip = within(screen.getByRole("status"));

    expect(tooltip.getByText(gia.name)).toBeInTheDocument();
    expect(tooltip.getByText("£10,000")).toHaveClass("figure");
    expect(tooltip.getByText("£688,345")).toHaveClass("figure");
  });

  // Two pensions, the ISA, the current account and the home, stacked
  // family by family from the baseline, the second pension receding
  // toward the card from the first, and the mortgage stacked down from
  // nothing in the first debt grey, each but the current account named
  // under the crosshair from the top of the stack down, over the net
  // worth they come to, which counts the home and the current account.
  // The two pensions are one owner's, and their £1,600 counts at the
  // £1,360 drawing them would leave.
  it("draws each account on its own, family by family, and names each under the crosshair", async () => {
    const listed = [...accounts, { ...sipp, owner: pension.owner }];
    const years = [2026, 2027].map((year, place) => ({
      age: 34 + place,
      allowances: { 1: lumpSumAllowance },
      balances: { 2: 2000, 3: 300, 4: 400000, 5: -180000, 6: 1000, 20: 600 },
      deferred: 1600,
      early: 0,
      free: 2000,
      uncovered: 0,
      year,
    }));
    render(
      <ProjectionChart
        accounts={listed}
        milestones={[]}
        plan={drawing}
        points={years}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Liquidity" }));
    fireEvent.click(screen.getByRole("switch", { name: "Bars" }));

    expect(
      screen
        .getAllByText(byClass("recharts-area-curve"), { suggest: false })
        .map((curve) => curve.getAttribute("stroke")),
    ).toStrictEqual(
      [6, 20, 2, 3, 4, 5].map((id) => `var(--color-account-${String(id)})`),
    );
    expect(colours()).toContain(
      "--color-account-6: color-mix(in oklab, var(--chart-2), var(--card) 0%);",
    );
    expect(colours()).toContain(
      "--color-account-20: color-mix(in oklab, var(--chart-2), var(--card) 30%);",
    );
    expect(colours()).toContain(
      "--color-account-4: color-mix(in oklab, var(--chart-3), var(--card) 0%);",
    );
    expect(colours()).toContain(
      "--color-account-5: color-mix(in oklab, var(--chart-5), var(--card) 0%);",
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2027 · Age 35");

    const tooltip = within(screen.getByRole("status"));

    expect(
      tooltip
        .getAllByText(/^(Home|Current account|Stocks|SIPP|Workplace|Mortgage)/)
        .map((name) => name.textContent),
    ).toStrictEqual([
      home.name,
      isa.name,
      sipp.name,
      pension.name,
      mortgage.name,
    ]);
    expect(tooltip.getByText("−£180,000")).toHaveClass("figure");
    expect(tooltip.getByText("Net worth")).toBeInTheDocument();
    expect(tooltip.getByText("£223,660")).toHaveClass("figure");
  });

  // Four debts take the three debt greys in the order they are listed,
  // and the fourth the first again a step toward the card. The car loan
  // owes nothing from 2027, so from then it is gone: no dot under the
  // crosshair and no name beside it, where the debts still owed keep
  // both.
  it("stacks the debts down from nothing in the debt greys, and drops a debt once it owes nothing", async () => {
    const debt = (id: number, name: string): Account => ({
      ...mortgage,
      id,
      name,
    });
    const listed = [
      mortgage,
      debt(7, "Car loan"),
      debt(8, "Card"),
      debt(9, "Family loan"),
    ];
    const years = [
      { 5: -180000, 7: -5000, 8: -2000, 9: -1000 },
      { 5: -170000, 7: 0, 8: -1500, 9: -1000 },
      { 5: -160000, 7: 0, 8: -1000, 9: -1000 },
    ].map((balances, place) => ({
      age: 34 + place,
      allowances: { 1: lumpSumAllowance },
      balances,
      deferred: 0,
      early: 0,
      free: 0,
      uncovered: 0,
      year: 2026 + place,
    }));
    render(
      <ProjectionChart
        accounts={listed}
        milestones={[]}
        plan={drawing}
        points={years}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Bars" }));

    expect(colours()).toContain(
      "--color-account-7: color-mix(in oklab, var(--chart-5-2), var(--card) 0%);",
    );
    expect(colours()).toContain(
      "--color-account-8: color-mix(in oklab, var(--chart-5-3), var(--card) 0%);",
    );
    expect(colours()).toContain(
      "--color-account-9: color-mix(in oklab, var(--chart-5), var(--card) 30%);",
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2027 · Age 35");

    const tooltip = within(screen.getByRole("status"));

    expect(
      screen
        .getAllByText(byClass("recharts-dot"), { suggest: false })
        .map((dot) => dot.getAttribute("fill")),
    ).toStrictEqual(
      [5, 8, 9].map((id) => `var(--color-account-${String(id)})`),
    );
    expect(tooltip.getByText("Card")).toBeInTheDocument();
    expect(tooltip.queryByText("Car loan")).not.toBeInTheDocument();
  });

  // On the net worth, a car on a PCP is drawn at its equity, what it is worth less what
  // the PCP owes, and the PCP is not drawn beside it: £20,000 against
  // £25,000 owed is £5,000 below nothing in 2026, and £18,000 against
  // £10,000 is £8,000 above it in 2027. The card, secured on nothing, is
  // a debt of its own, and keeps the second grey it takes as the second
  // debt listed though the first is drawn in the car. The net worth is
  // the same either way. The axis reaches down to the car's equity and
  // the card together, £6,000 below nothing, as it reaches up to £8,000.
  it("draws an asset at its equity, the loans secured on it drawn in it rather than beside it", async () => {
    const car: Account = {
      balance: 20000,
      growth: { kind: "fixed", rate: -0.1 },
      id: 10,
      kind: "car",
      name: "Car",
    };
    const pcp: Account = { ...mortgage, id: 11, name: "PCP", secures: car.id };
    const card: Account = { ...mortgage, id: 12, name: "Card" };
    const years = [
      { 10: 20000, 11: -25000, 12: -1000 },
      { 10: 18000, 11: -10000, 12: -500 },
    ].map((balances, place) => ({
      age: 34 + place,
      allowances: { 1: lumpSumAllowance },
      balances,
      deferred: 0,
      early: 0,
      free: 0,
      uncovered: 0,
      year: 2026 + place,
    }));
    render(
      <ProjectionChart
        accounts={[car, pcp, card]}
        milestones={[]}
        plan={drawing}
        points={years}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Liquidity" }));

    expect(
      screen.getAllByText(byClass("recharts-bar"), { suggest: false }),
    ).toHaveLength(2);
    expect(colours()).toContain(
      "--color-account-12: color-mix(in oklab, var(--chart-5-2), var(--card) 0%);",
    );
    expect(colours()).not.toContain("--color-account-11");
    expect(pounds()).toStrictEqual([
      "−£6k",
      "−£4k",
      "−£2k",
      "£0",
      "£2k",
      "£4k",
      "£6k",
      "£8k",
    ]);

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2027 · Age 35");

    const tooltip = within(screen.getByRole("status"));

    expect(
      tooltip.getAllByText(/^(Car|PCP|Card)$/).map((name) => name.textContent),
    ).toStrictEqual(["Car", "Card"]);
    expect(tooltip.getByText("£8,000")).toHaveClass("figure");
    expect(tooltip.getByText("−£500")).toHaveClass("figure");
    expect(tooltip.getByText("£7,500")).toHaveClass("figure");

    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    await screen.findByText("2026 · Age 34");

    expect(within(screen.getByRole("status")).getByText("−£5,000")).toHaveClass(
      "figure",
    );
  });

  // The plan's liquidity to begin with: the ISA, and every debt, the
  // loan on the flat among them, but not the flat, so £250,000 less the
  // £200,000 owed on it is £50,000. On the switch its net worth: the
  // flat at its equity, £500,000 less the £200,000, and the loan in it
  // rather than beside it, £550,000 in all. And back.
  it("counts the plan's liquidity to begin with, and its net worth on the switch", async () => {
    const flat: Account = {
      balance: 500000,
      growth: { kind: "fixed", rate: 0 },
      id: 10,
      kind: "house",
      name: "Flat",
    };
    const loan: Account = {
      ...mortgage,
      id: 11,
      name: "Flat mortgage",
      secures: flat.id,
    };
    const years = [2026, 2027].map((year, place) => ({
      age: 34 + place,
      allowances: { 1: lumpSumAllowance },
      balances: { 2: 250000, 10: 500000, 11: -200000 },
      deferred: 0,
      early: 0,
      free: 250000,
      uncovered: 0,
      year,
    }));
    render(
      <ProjectionChart
        accounts={[isa, flat, loan]}
        milestones={[]}
        plan={drawing}
        points={years}
      />,
    );
    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2027 · Age 35");
    const tooltip = (): HTMLElement => screen.getByRole("status");

    expect(screen.getByRole("switch", { name: "Liquidity" })).not.toBeChecked();
    expect(flatNames()).toStrictEqual([isa.name, loan.name]);
    expect(within(tooltip()).getByText("Liquidity")).toBeInTheDocument();
    expect(within(tooltip()).getByText("£50,000")).toHaveClass("figure");

    fireEvent.click(screen.getByRole("switch", { name: "Liquidity" }));

    expect(screen.getByRole("switch", { name: "Net worth" })).toBeChecked();
    expect(flatNames()).toStrictEqual([flat.name, isa.name]);
    expect(within(tooltip()).getByText("£300,000")).toHaveClass("figure");
    expect(within(tooltip()).getByText("Net worth")).toBeInTheDocument();
    expect(within(tooltip()).getByText("£550,000")).toHaveClass("figure");

    fireEvent.click(screen.getByRole("switch", { name: "Net worth" }));

    expect(flatNames()).toStrictEqual([isa.name, loan.name]);
  });

  // The flat's mortgage held in two sub-accounts, owing £150,000 and
  // £50,000, is drawn on the liquidity as the one mortgage owing both,
  // named for the flat; on the net worth both are drawn in the flat.
  it("draws a mortgage held in sub-accounts as the one mortgage on the liquidity", async () => {
    const flat: Account = {
      balance: 500000,
      growth: { kind: "fixed", rate: 0 },
      id: 10,
      kind: "house",
      name: "Flat",
    };
    const first: Account = {
      ...mortgage,
      id: 11,
      name: "Flat mortgage 1",
      secures: flat.id,
    };
    const years = [2026, 2027].map((year, place) => ({
      age: 34 + place,
      allowances: { 1: lumpSumAllowance },
      balances: { 2: 250000, 10: 500000, 11: -150000, 12: -50000 },
      deferred: 0,
      early: 0,
      free: 250000,
      uncovered: 0,
      year,
    }));
    render(
      <ProjectionChart
        accounts={[
          isa,
          flat,
          first,
          { ...first, id: 12, name: "Flat mortgage 2" },
        ]}
        milestones={[]}
        plan={drawing}
        points={years}
      />,
    );
    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2027 · Age 35");
    const tooltip = (): HTMLElement => screen.getByRole("status");

    expect(flatNames()).toStrictEqual([isa.name, "Flat mortgage"]);
    expect(within(tooltip()).getByText("−£200,000")).toHaveClass("figure");
    expect(within(tooltip()).getByText("£50,000")).toHaveClass("figure");

    fireEvent.click(screen.getByRole("switch", { name: "Liquidity" }));

    expect(flatNames()).toStrictEqual([flat.name, isa.name]);
    expect(within(tooltip()).getByText("£300,000")).toHaveClass("figure");
  });

  // A column both bases draw is handed the one dataKey on either, so
  // recharts, which draws a column again for a dataKey it has not seen,
  // leaves the ISA's be through a switch to the net worth and back,
  // where the flat's and its loan's come and go.
  it("hands a column both bases draw the same dataKey on either", () => {
    const flat: Account = {
      balance: 500000,
      growth: { kind: "fixed", rate: 0 },
      id: 10,
      kind: "house",
      name: "Flat",
    };
    const loan: Account = {
      ...mortgage,
      id: 11,
      name: "Flat mortgage",
      secures: flat.id,
    };
    const years = [2026, 2027].map((year, place) => ({
      age: 34 + place,
      allowances: { 1: lumpSumAllowance },
      balances: { 2: 250000, 10: 500000, 11: -200000 },
      deferred: 0,
      early: 0,
      free: 250000,
      uncovered: 0,
      year,
    }));
    render(
      <ProjectionChart
        accounts={[isa, flat, loan]}
        milestones={[]}
        plan={drawing}
        points={years}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Liquidity" }));
    fireEvent.click(screen.getByRole("switch", { name: "Net worth" }));
    const handed = (key: string): Set<BarProps["dataKey"]> =>
      new Set(
        vi
          .mocked(Bar)
          .mock.calls.filter(([props]) => props.fill === `var(--color-${key})`)
          .map(([props]) => props.dataKey),
      );

    expect(handed("account-2").size).toBe(1);
    expect(handed("account-10").size).toBe(1);
    expect(handed("account-11").size).toBe(1);
  });

  // Held to £1m at most, the axis is marked every £250,000 as recharts
  // would mark it. £100,000 owed takes it below nothing only that far,
  // and reaches no step; £600,000 owed reaches two. Owed alone, £188,000
  // is marked every £50,000 down to the three steps it reaches.
  it("takes the axis below nothing only as far as the debts reach, marked at the steps they reach", () => {
    const plan = (balances: Record<number, number>): ProjectionPoint[] =>
      [2026, 2027].map((year, place) => ({
        age: 34 + place,
        allowances: { 1: lumpSumAllowance },
        balances,
        deferred: 0,
        early: 0,
        free: 0,
        uncovered: 0,
        year,
      }));
    const listed = [pension, mortgage];
    const { rerender } = render(
      <ProjectionChart
        accounts={listed}
        milestones={[]}
        plan={drawing}
        points={plan({ 5: -100000, 6: 1000000 })}
      />,
    );

    expect(pounds()).toStrictEqual(["£0", "£250k", "£500k", "£750k", "£1m"]);

    rerender(
      <ProjectionChart
        accounts={listed}
        milestones={[]}
        plan={drawing}
        points={plan({ 5: -600000, 6: 1000000 })}
      />,
    );

    expect(pounds()).toStrictEqual([
      "−£500k",
      "−£250k",
      "£0",
      "£250k",
      "£500k",
      "£750k",
      "£1m",
    ]);

    rerender(
      <ProjectionChart
        accounts={listed}
        milestones={[]}
        plan={drawing}
        points={plan({ 5: -188000, 6: 0 })}
      />,
    );

    expect(pounds()).toStrictEqual(["−£150k", "−£100k", "−£50k", "£0"]);
  });

  // The axis holds one width whatever it marks, so a label no wider or
  // narrower than the last leaves recharts nothing to measure: every
  // label ends 8px short of the 57px the axis takes, on the liquidity's
  // marks, down to £195,000 owed, and on the net worth's alike.
  it("holds the axis to one width whatever it marks", () => {
    const flat: Account = {
      balance: 500000,
      growth: { kind: "fixed", rate: 0 },
      id: 10,
      kind: "house",
      name: "Flat",
    };
    const loan: Account = {
      ...mortgage,
      id: 11,
      name: "Flat mortgage",
      secures: flat.id,
    };
    const years = [2026, 2027].map((year, place) => ({
      age: 34 + place,
      allowances: { 1: lumpSumAllowance },
      balances: { 2: 250000, 10: 500000, 11: -200000 },
      deferred: 0,
      early: 0,
      free: 250000,
      uncovered: 0,
      year,
    }));
    render(
      <ProjectionChart
        accounts={[isa, flat, loan]}
        milestones={[]}
        plan={drawing}
        points={years}
      />,
    );
    const ends = (): Set<null | string> =>
      new Set(
        screen
          .getAllByText(byClass("recharts-cartesian-axis-tick-value"), {
            suggest: false,
          })
          .filter((tick) => tick.textContent.includes("£"))
          .map((tick) => tick.getAttribute("x")),
      );

    expect(pounds()).toContain("−£195k");
    expect(ends()).toStrictEqual(new Set(["49"]));

    fireEvent.click(screen.getByRole("switch", { name: "Liquidity" }));

    expect(pounds()).toContain("£600k");
    expect(ends()).toStrictEqual(new Set(["49"]));
  });

  it("sets the caller's controls and choices beside the toggle, and none over nothing to plot", () => {
    const { rerender } = render(
      <ProjectionChart
        accounts={held}
        choices={<button type="button">A choice</button>}
        controls={<button type="button">A control</button>}
        milestones={[]}
        plan={drawing}
        points={points}
      />,
    );

    expect(
      screen.getByRole("button", { name: "A control" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "A choice" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Bars" })).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Liquidity" }),
    ).toBeInTheDocument();

    rerender(
      <ProjectionChart
        accounts={held}
        choices={<button type="button">A choice</button>}
        controls={<button type="button">A control</button>}
        milestones={[]}
        plan={drawing}
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

  it("draws a column per year to begin with, and swaps it for areas on the toggle and back", () => {
    render(
      <ProjectionChart
        accounts={held}
        milestones={[]}
        plan={drawing}
        points={points}
      />,
    );

    expect(
      screen.getAllByText(byClass("recharts-bar"), { suggest: false }),
    ).toHaveLength(2);

    const control = screen.getByRole("switch", { name: "Bars" });

    expect(control).toBeChecked();

    fireEvent.click(control);

    expect(screen.getByRole("switch", { name: "Areas" })).not.toBeChecked();
    expect(
      screen.getAllByText(byClass("recharts-area"), { suggest: false }),
    ).toHaveLength(2);
    expect(
      screen.queryAllByText(byClass("recharts-bar"), { suggest: false }),
    ).toHaveLength(0);

    fireEvent.click(screen.getByRole("switch", { name: "Areas" }));

    expect(screen.getByRole("switch", { name: "Bars" })).toBeChecked();
    expect(
      screen.getAllByText(byClass("recharts-bar"), { suggest: false }),
    ).toHaveLength(2);
    expect(
      screen.queryAllByText(byClass("recharts-area"), { suggest: false }),
    ).toHaveLength(0);
  });

  it("marks no year and names nothing uncovered while the money lasts", async () => {
    render(
      <ProjectionChart
        accounts={held}
        milestones={[]}
        plan={drawing}
        points={points}
      />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    await screen.findByText("2027 · Age 35");

    expect(marks()).toHaveLength(0);
    expect(screen.queryByText("Runs out")).not.toBeInTheDocument();
    expect(screen.queryByText("Early pension")).not.toBeInTheDocument();
    expect(screen.queryByText("Retirement")).not.toBeInTheDocument();
    expect(screen.queryByText("Uncovered")).not.toBeInTheDocument();
    expect(screen.queryByText("Drawn early")).not.toBeInTheDocument();
  });

  it("marks the first year a pension is drawn early apart from the year the money runs out", () => {
    render(
      <ProjectionChart
        accounts={held}
        milestones={[]}
        plan={drawing}
        points={earlyPoints}
      />,
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
  it("marks a milestone beside the warnings in ink, unnamed, under either mark", () => {
    render(
      <ProjectionChart
        accounts={held}
        milestones={[{ id: "retirement", name: "Retirement", year: 2026 }]}
        plan={drawing}
        points={earlyPoints}
      />,
    );

    expect(marks().map((mark) => mark.getAttribute("x"))).toStrictEqual([
      "2026",
      "2027",
      "2028",
    ]);
    expect(marks()[0]).toHaveAttribute("stroke", "var(--foreground)");
    expect(screen.queryByText("Retirement")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Bars" }));

    expect(marks().map((mark) => mark.getAttribute("x"))).toStrictEqual([
      "2026",
      "2027",
      "2028",
    ]);
  });

  it("names what a year drew early under the crosshair", async () => {
    render(
      <ProjectionChart
        accounts={held}
        milestones={[]}
        plan={drawing}
        points={earlyPoints}
      />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 35")).toHaveClass("font-medium");

    const tooltip = within(screen.getByRole("status"));

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
      <ProjectionChart
        accounts={held}
        milestones={[]}
        plan={drawing}
        points={shortPoints}
      />,
    );

    expect(marks()).toHaveLength(1);
    expect(marks()[0]).toHaveAttribute("x", "2027");
    expect(screen.getByText("Runs out")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Bars" }));

    expect(marks()).toHaveLength(1);
    expect(marks()[0]).toHaveAttribute("x", "2027");
  });

  it("names what a short year could not cover under the crosshair", async () => {
    render(
      <ProjectionChart
        accounts={held}
        milestones={[]}
        plan={drawing}
        points={shortPoints}
      />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 35")).toHaveClass("font-medium");

    const tooltip = within(screen.getByRole("status"));

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
        plan={drawing}
        points={[
          {
            age: 34,
            allowances: { 1: lumpSumAllowance },
            balances: { 2: 0, 6: 0 },
            deferred: 0,
            early: 0,
            free: 0,
            uncovered: 0,
            year: 2026,
          },
          {
            age: 35,
            allowances: { 1: lumpSumAllowance },
            balances: { 2: 0, 6: 0 },
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
    render(
      <ProjectionChart
        accounts={held}
        milestones={[]}
        plan={drawing}
        points={[]}
      />,
    );

    expect(
      screen.getByText("Add an account or an asset to see it projected."),
    ).toBeInTheDocument();
  });

  // Fifteen years from 2026. Every milestone within them is marked, the
  // chosen one solid with a dot at what the stack comes to on the basis
  // counted, the rest faint; one past them goes undrawn. No milestone is
  // named on the plot. The wrappers hold £200,000, the pension's half of
  // it counted at the £85,000 drawing it would leave, beside £20,000 of
  // cash and £150,000 owed on a home worth £300,000, so the liquidity is
  // £55,000 and the net worth £355,000, and the dot stands at each in
  // turn where the wrappers alone would put it at £185,000.
  it("marks every milestone in the plan's years, the chosen one solid with a dot where the basis's total stands", () => {
    const years = Array.from({ length: 15 }, (_, place) => ({
      age: 34 + place,
      allowances: { 1: lumpSumAllowance },
      balances: { 2: 100000, 3: 20000, 4: 300000, 5: -150000, 6: 100000 },
      deferred: 100000,
      early: 0,
      free: 100000,
      uncovered: 0,
      year: 2026 + place,
    }));
    render(
      <ProjectionChart
        accounts={accounts}
        milestones={[
          { id: 1, name: "Kids leave home", year: 2026 },
          { id: "retirement", name: "Retirement", year: 2030 },
          { id: 5, name: "Care", year: 2060 },
        ]}
        plan={drawing}
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
    expect(dots()[0]).toHaveAttribute("fill", "var(--foreground)");
    expect(dots()[0]).toHaveAttribute("x", "2030");
    expect(dots()[0]).toHaveAttribute("y", "55000");

    fireEvent.click(screen.getByRole("switch", { name: "Liquidity" }));

    expect(dots()[0]).toHaveAttribute("y", "355000");
    expect(
      screen.queryByText(/^(Kids leave home|Retirement|Care)$/),
    ).not.toBeInTheDocument();
  });

  it("draws no dot for a choice the plan's years do not reach, nor for none", () => {
    const { rerender } = render(
      <ProjectionChart
        accounts={held}
        milestones={[{ id: 5, name: "Care", year: 2060 }]}
        plan={drawing}
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
        plan={drawing}
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
        plan={drawing}
        points={points}
      />,
    );

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2027 · Age 35");

    expect(
      within(screen.getByRole("status")).getByText("Retirement and Sabbatical"),
    ).toHaveClass("text-muted-foreground");
  });

  // The reference household projected two years on: its pension counts
  // in the stack at what drawing it would leave, so on the net worth the
  // stack comes to the net worth the tiles measure off the same point.
  it("stacks to the net worth the tiles measure, a pension at what drawing it would leave", async () => {
    const run = { ...kept, plan: { ...retiring, years: 2 } };
    const projected = project(run.accounts, run.schedule, run.plan);
    const [, entering2027] = projected;
    render(
      <ProjectionChart
        accounts={run.accounts}
        milestones={[]}
        plan={run.plan}
        points={projected}
      />,
    );
    fireEvent.click(screen.getByRole("switch", { name: "Liquidity" }));

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    await screen.findByText("2027 · Age 35");

    expect(
      within(screen.getByRole("status")).getByText(
        formatGbp(
          entering2027 === undefined
            ? 0
            : measuredOf(entering2027, { month: 0, year: 2027 }, run).worth,
        ),
      ),
    ).toHaveClass("figure");
  });

  // The reference household projected to 2050. Its owner, born in 1992,
  // is 56 entering 2048, short of the pension age all year, and 57
  // entering 2049, drawing it all year. On the liquidity the chosen
  // milestone's dot stands at the liquid net worth the tiles measure off
  // the same point in both, the pension left out of the stack in the
  // first and counted in it from the second.
  it("stacks to the liquid net worth the tiles measure, a pension from its owner's pension age", () => {
    const run = { ...kept, plan: { ...retiring, years: 24 } };
    const projected = project(run.accounts, run.schedule, run.plan);
    const liquidIn = (year: number): string => {
      const entering = projected.find((point) => point.year === year);
      return String(
        entering === undefined
          ? 0
          : measuredOf(entering, { month: 0, year }, run).liquid,
      );
    };
    const chart = (year: number): JSX.Element => (
      <ProjectionChart
        accounts={run.accounts}
        milestones={[{ id: "retirement", name: "Retirement", year }]}
        plan={run.plan}
        points={projected}
        selected="retirement"
      />
    );
    const { rerender } = render(chart(2048));

    expect(dots()[0]).toHaveAttribute("y", liquidIn(2048));

    rerender(chart(2049));

    expect(dots()[0]).toHaveAttribute("y", liquidIn(2049));
  });

  // A scenario's pension and ISA set against a household holding the
  // ISA alone, at £600,000 a year from 2027, which is past the
  // scenario's own stack in no year, so the axis is the scenario's; the
  // household's plan opens a year later, so its line starts there.
  it("draws the household it is set against as a dashed line over the columns, named under the crosshair", async () => {
    render(
      <ProjectionChart
        accounts={held}
        against={{
          accounts: [isa],
          plan: drawing,
          points: points
            .slice(1)
            .map((point) => ({ ...point, balances: { 2: 600_000 } })),
        }}
        milestones={[]}
        plan={drawing}
        points={points}
      />,
    );

    expect(
      screen.getByText(byClass("recharts-line-curve"), { suggest: false }),
    ).toHaveAttribute("stroke-dasharray", "4 4");
    expect(
      screen.getAllByText(byClass("recharts-bar"), { suggest: false }),
    ).toHaveLength(2);

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 35")).toHaveClass("font-medium");

    const tooltip = within(screen.getByRole("status"));

    expect(tooltip.getByText("Household")).toBeInTheDocument();
    expect(tooltip.getByText("£600,000")).toHaveClass("figure");
    expect(
      screen.getByText(byClass("recharts-tooltip-cursor"), { suggest: false }),
    ).toHaveClass("recharts-rectangle");
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
