import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

const bySlot =
  (slot: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.getAttribute("data-slot") === slot;

const points = [
  {
    age: 36,
    deferred: 412880,
    early: 0,
    free: 286145,
    uncovered: 0,
    year: 2026,
  },
  {
    age: 37,
    deferred: 462079,
    early: 0,
    free: 321452,
    uncovered: 0,
    year: 2027,
  },
  {
    age: 38,
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
    deferred: 412880,
    early: 0,
    free: 286145,
    uncovered: 0,
    year: 2026,
  },
  { age: 37, deferred: 41209, early: 0, free: 0, uncovered: 18450, year: 2027 },
  { age: 38, deferred: 0, early: 0, free: 0, uncovered: 52310, year: 2028 },
];

// The same plan with its pension drawn early in its second year, before
// it runs out in its third, so both marks have a year to fall on.
const earlyPoints = [
  {
    age: 36,
    deferred: 412880,
    early: 0,
    free: 286145,
    uncovered: 0,
    year: 2026,
  },
  { age: 37, deferred: 41209, early: 26667, free: 0, uncovered: 0, year: 2027 },
  { age: 38, deferred: 0, early: 0, free: 0, uncovered: 52310, year: 2028 },
];

// A retirement past every plan here, so no milestone is drawn unless a
// test asks for one.
const beyond = 2049;

// The vertical rule recharts draws for a ReferenceLine, which carries the
// year it stands at as an attribute.
const marks = (): HTMLElement[] =>
  screen.queryAllByText(byClass("recharts-reference-line-line"), {
    suggest: false,
  });

describe("ProjectionChart", () => {
  it("plots the years with a legend naming each series in stacking order", () => {
    render(<ProjectionChart points={points} retirement={beyond} />);

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(
      screen.getAllByText(/^Tax-/).map((name) => name.textContent),
    ).toStrictEqual(["Tax-deferred", "Tax-free"]);
  });

  // The crosshair moves on the arrow keys as it does under the pointer,
  // and recharts moves it a frame later.
  it("shows the year, the age, each figure and the total under the crosshair", async () => {
    render(<ProjectionChart points={points} retirement={beyond} />);

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("2027 · Age 37")).toHaveClass("font-medium");

    const tooltip = within(screen.getByText(bySlot("projection-tooltip")));

    expect(tooltip.getByText("£462,079")).toHaveClass("figure");
    expect(tooltip.getByText("£321,452")).toHaveClass("figure");
    expect(tooltip.getByText("£783,531")).toHaveClass("figure");
    expect(tooltip.getByText("Total")).toBeInTheDocument();
  });

  it("swaps the areas for a column per year on the toggle, and back", () => {
    render(<ProjectionChart points={points} retirement={beyond} />);

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
    render(<ProjectionChart points={points} retirement={beyond} />);

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
    render(<ProjectionChart points={earlyPoints} retirement={beyond} />);

    expect(marks().map((mark) => mark.getAttribute("x"))).toStrictEqual([
      "2027",
      "2028",
    ]);
    expect(screen.getByText("Early pension")).toBeInTheDocument();
    expect(screen.getByText("Runs out")).toBeInTheDocument();
  });

  it("marks the year its owner retires in beside the warnings, under either mark", () => {
    render(<ProjectionChart points={earlyPoints} retirement={2026} />);

    expect(marks().map((mark) => mark.getAttribute("x"))).toStrictEqual([
      "2026",
      "2027",
      "2028",
    ]);
    expect(screen.getByText("Retirement")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Areas" }));

    expect(marks().map((mark) => mark.getAttribute("x"))).toStrictEqual([
      "2026",
      "2027",
      "2028",
    ]);
    expect(screen.getByText("Retirement")).toBeInTheDocument();
  });

  it("names what a year drew early under the crosshair", async () => {
    render(<ProjectionChart points={earlyPoints} retirement={beyond} />);

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
    render(<ProjectionChart points={shortPoints} retirement={beyond} />);

    expect(marks()).toHaveLength(1);
    expect(marks()[0]).toHaveAttribute("x", "2027");
    expect(screen.getByText("Runs out")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("switch", { name: "Areas" }));

    expect(marks()).toHaveLength(1);
    expect(marks()[0]).toHaveAttribute("x", "2027");
  });

  it("names what a short year could not cover under the crosshair", async () => {
    render(<ProjectionChart points={shortPoints} retirement={beyond} />);

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

  it("says so instead of plotting nothing when no account is a wrapper", () => {
    render(
      <ProjectionChart
        points={[
          { age: 36, deferred: 0, early: 0, free: 0, uncovered: 0, year: 2026 },
          { age: 37, deferred: 0, early: 0, free: 0, uncovered: 0, year: 2027 },
        ]}
        retirement={beyond}
      />,
    );

    expect(
      screen.getByText(
        "Add a tax-free or tax-deferred account to see it projected.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Accounts & assets" }),
    ).toHaveAttribute("href", "/accounts");
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("has nothing to plot over no years either", () => {
    render(<ProjectionChart points={[]} retirement={beyond} />);

    expect(
      screen.getByText(
        "Add a tax-free or tax-deferred account to see it projected.",
      ),
    ).toBeInTheDocument();
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
