import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { curve } from "@/data/inflation.fixture";
import { bySlot } from "@/test/dom";

import { CurveChart } from "./curve-chart";

// A part recharts draws by its class: a tick, a reference's dot, which
// has no role, label or text a reader meets, so no query is more
// accessible than this one and none can be suggested.
const byClass =
  (className: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.classList.contains(className) === true;

// The first of September's curve, from which 2.95% is derived.
function renderChart(): void {
  render(<CurveChart curve={curve} derived={0.0295} />);
}

describe("CurveChart", () => {
  it("draws the curve along the maturities read, with no legend", () => {
    renderChart();

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(
      screen
        .getAllByText(byClass("recharts-cartesian-axis-tick-value"), {
          suggest: false,
        })
        .map((tick) => tick.textContent)
        .filter((tick) => tick.endsWith("y")),
    ).toStrictEqual(["5y", "10y", "20y", "30y"]);
    expect(screen.queryByText("Implied inflation")).not.toBeInTheDocument();
  });

  // The point is drawn in a layer of its own above the line's dots,
  // which recharts lays a pass after the rest.
  it("marks the horizon's point with its rate, and names the inflation derived from it where its line ends", async () => {
    renderChart();

    expect(
      await screen.findAllByText(byClass("recharts-reference-dot-dot"), {
        suggest: false,
      }),
    ).toHaveLength(1);
    expect(screen.getByText("20y 3.365%")).toBeInTheDocument();
    expect(screen.getByText("Derived 2.95%")).toBeInTheDocument();
  });

  // The pointer moves on the arrow keys as it does under the mouse,
  // onto the second maturity from the first, and recharts moves it a
  // frame later.
  it("shows the maturity and the rate the curve implies there under the pointer", async () => {
    renderChart();

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    const tooltip = await screen.findByText(bySlot("curve-tooltip"), {
      suggest: false,
    });

    expect(within(tooltip).getByText("10y 3.441%")).toHaveClass("figure");
  });
});
