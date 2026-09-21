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
  { age: 36, deferred: 412880, free: 286145, uncovered: 0, year: 2026 },
  { age: 37, deferred: 462079, free: 321452, uncovered: 0, year: 2027 },
  { age: 38, deferred: 513737, free: 358525, uncovered: 0, year: 2028 },
];

describe("ProjectionChart", () => {
  it("plots the years with a legend naming each series in stacking order", () => {
    render(<ProjectionChart points={points} />);

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(
      screen.getAllByText(/^Tax-/).map((name) => name.textContent),
    ).toStrictEqual(["Tax-deferred", "Tax-free"]);
  });

  // The crosshair moves on the arrow keys as it does under the pointer,
  // and recharts moves it a frame later.
  it("shows the year, the age, each figure and the total under the crosshair", async () => {
    render(<ProjectionChart points={points} />);

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
    render(<ProjectionChart points={points} />);

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

  it("says so instead of plotting nothing when no account is a wrapper", () => {
    render(
      <ProjectionChart
        points={[
          { age: 36, deferred: 0, free: 0, uncovered: 0, year: 2026 },
          { age: 37, deferred: 0, free: 0, uncovered: 0, year: 2027 },
        ]}
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
    render(<ProjectionChart points={[]} />);

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
