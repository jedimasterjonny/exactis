import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectionChart, ProjectionPending } from "./projection-chart";

const bySlot =
  (slot: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.getAttribute("data-slot") === slot;

const points = [
  { age: 36, deferred: 412880, free: 286145, year: 2026 },
  { age: 37, deferred: 462079, free: 321452, year: 2027 },
  { age: 38, deferred: 513737, free: 358525, year: 2028 },
];

describe("ProjectionChart", () => {
  it("leads with the total at the horizon and plots the years to it", () => {
    render(<ProjectionChart points={points} />);

    expect(screen.getByText("Tax wrappers")).toHaveClass("label");
    expect(screen.getByText("£872,262")).toHaveClass("figure");
    expect(screen.getByText("in 2028")).toHaveClass("figure");
    expect(screen.getByText("From £699,025 today")).toBeInTheDocument();
    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
  });

  it("names each series in a legend, in stacking order", () => {
    render(<ProjectionChart points={points} />);

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

  it("says so instead of plotting nothing when no account is a wrapper", () => {
    render(
      <ProjectionChart
        points={[
          { age: 36, deferred: 0, free: 0, year: 2026 },
          { age: 37, deferred: 0, free: 0, year: 2027 },
        ]}
      />,
    );

    expect(screen.getByText("—")).toHaveClass("figure");
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

    expect(screen.getByText("Tax wrappers")).toHaveClass("label");
    expect(screen.getByText("—")).toHaveClass("figure");
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Reading the store…",
    );
  });
});
