import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectionChart, ProjectionPending } from "./projection-chart";

const bySlot =
  (slot: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.getAttribute("data-slot") === slot;

const points = [
  { age: 34, deferred: 391640, free: 271930, year: 2026 },
  { age: 35, deferred: 438308, free: 305483, year: 2027 },
  { age: 36, deferred: 487309, free: 340714, year: 2028 },
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

    expect(await screen.findByText("2027 · Age 35")).toHaveClass("font-medium");

    const tooltip = within(screen.getByText(bySlot("projection-tooltip")));

    expect(tooltip.getByText("£438,308")).toHaveClass("figure");
    expect(tooltip.getByText("£305,483")).toHaveClass("figure");
    expect(tooltip.getByText("£743,791")).toHaveClass("figure");
    expect(tooltip.getByText("Total")).toBeInTheDocument();
  });

  it("says so instead of plotting nothing when no account is a wrapper", () => {
    render(
      <ProjectionChart
        points={[
          { age: 34, deferred: 0, free: 0, year: 2026 },
          { age: 35, deferred: 0, free: 0, year: 2027 },
        ]}
      />,
    );

    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Add a tax-free or tax-deferred account to see it projected.",
    );
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });

  it("has nothing to plot over no years either", () => {
    render(<ProjectionChart points={[]} />);

    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Add a tax-free or tax-deferred account to see it projected.",
    );
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
