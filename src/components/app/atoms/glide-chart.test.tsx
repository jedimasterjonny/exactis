import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Plan } from "@/data/plan";

import { plan, retiring } from "@/data/income.fixture";
import { bySlot } from "@/test/dom";

import { GlideChart } from "./glide-chart";

// A part recharts draws by its class: a tick, a reference's dot, which
// has no role, label or text a reader meets, so no query is more
// accessible than this one and none can be suggested.
const byClass =
  (className: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.classList.contains(className) === true;

// Five points of bonds at 30, before the plan opens at 34, fifteen to
// 52, rising to 40 by 60, and holding 40 to 95, past the 91 the plan
// runs to.
const glide = [
  { age: 30, bonds: 0.05 },
  { age: 52, bonds: 0.15 },
  { age: 60, bonds: 0.4 },
  { age: 95, bonds: 0.4 },
];

// The glide path over a plan opening in 2026, at 34, and running to 91,
// whose owner retires at 61 unless another plan is given.
function renderChart(over: Plan = retiring): void {
  render(<GlideChart glide={glide} plan={over} />);
}

// The ticks recharts writes along both axes, in the order drawn.
function ticks(): (null | string)[] {
  return screen
    .getAllByText(byClass("recharts-cartesian-axis-tick-value"), {
      suggest: false,
    })
    .map((tick) => tick.textContent);
}

describe("GlideChart", () => {
  // Within the plan the path reaches 40 points at 60 and holds them, so
  // the share is scaled to the half above it and ruled every ten points.
  it("draws the plan's ages ruled at each decade and the share scaled to the quarter above the highest the path reaches", () => {
    renderChart();

    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
    expect(ticks()).toStrictEqual([
      "40",
      "50",
      "60",
      "70",
      "80",
      "0%",
      "10%",
      "20%",
      "30%",
      "40%",
      "50%",
    ]);
  });

  // Everything in bonds by 70 scales the share to the whole, ruled at
  // each quarter; nothing in bonds at all lies along a scale to a
  // quarter, ruled every five points.
  it("scales the share to the whole for a path that reaches it, and to a quarter for one holding no bonds", () => {
    const { unmount } = render(
      <GlideChart glide={[{ age: 70, bonds: 1 }]} plan={retiring} />,
    );

    expect(
      ticks().filter((tick) => tick?.endsWith("%") === true),
    ).toStrictEqual(["0%", "25%", "50%", "75%", "100%"]);

    unmount();
    render(<GlideChart glide={[{ age: 70, bonds: 0 }]} plan={retiring} />);

    expect(
      ticks().filter((tick) => tick?.endsWith("%") === true),
    ).toStrictEqual(["0%", "5%", "10%", "15%", "20%", "25%"]);
  });

  // The anchors at 30 and 95 fall outside the plan's years, so only the
  // two within it are ringed.
  it("rings each anchor within the plan's years, and marks the owner's retirement", async () => {
    renderChart();

    expect(
      await screen.findAllByText(byClass("recharts-reference-dot-dot"), {
        suggest: false,
      }),
    ).toHaveLength(2);
    expect(screen.getByText("Retires 61")).toBeInTheDocument();
  });

  // With no anchors there is no path to hold a split, and the chart
  // reads everything in equities.
  it("reads everything in equities for a glide path of no anchors", async () => {
    render(<GlideChart glide={[]} plan={retiring} />);

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    const tooltip = await screen.findByText(bySlot("glide-tooltip"), {
      suggest: false,
    });

    expect(within(tooltip).getByText("Bonds 0.00%")).toBeInTheDocument();
    expect(within(tooltip).getByText("Equities 100.00%")).toBeInTheDocument();
  });

  // The fixture's owner retires at 92, past the plan's end. The rings
  // are waited for first, since recharts lays its references a pass
  // after the rest.
  it("marks no retirement past the plan's end", async () => {
    renderChart(plan);

    expect(
      await screen.findAllByText(byClass("recharts-reference-dot-dot"), {
        suggest: false,
      }),
    ).toHaveLength(2);
    expect(screen.queryByText(/^Retires/)).not.toBeInTheDocument();
  });

  // The pointer moves on the arrow keys as it does under the mouse, onto
  // 35 from 34, five twenty-seconds of the way from the five points of
  // bonds at 30 to the fifteen at 52: 7.27%.
  it("shows the age, its year and the split the glide path holds there under the pointer", async () => {
    renderChart();

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    const tooltip = await screen.findByText(bySlot("glide-tooltip"), {
      suggest: false,
    });

    expect(within(tooltip).getByText("Age 35 · 2027")).toBeInTheDocument();
    expect(within(tooltip).getByText("Bonds 7.27%")).toHaveClass("figure");
    expect(within(tooltip).getByText("Equities 92.73%")).toHaveClass("figure");
  });
});
