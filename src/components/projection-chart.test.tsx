import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProjectionChart, ProjectionPending } from "./projection-chart";

const points = [
  { age: 36, free: 286145, year: 2026 },
  { age: 37, free: 300452, year: 2027 },
  { age: 38, free: 315475, year: 2028 },
];

describe("ProjectionChart", () => {
  it("leads with the balance at the horizon and plots the years to it", () => {
    render(<ProjectionChart points={points} />);

    expect(screen.getByText("Tax-free")).toHaveClass("label");
    expect(screen.getByText("£315,475")).toHaveClass("figure");
    expect(screen.getByText("in 2028")).toHaveClass("figure");
    expect(screen.getByText("From £286,145 today")).toBeInTheDocument();
    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
  });

  // The crosshair moves on the arrow keys as it does under the pointer,
  // and recharts moves it a frame later.
  it("shows the year under the crosshair, the age, and the figure", async () => {
    render(<ProjectionChart points={points} />);

    const chart = screen.getByRole("application");
    chart.focus();
    fireEvent.keyDown(chart, { key: "ArrowRight" });

    expect(await screen.findByText("£300,452")).toHaveClass("figure");
    expect(screen.getByText("2027 · Age 37")).toHaveClass("font-medium");
  });

  it("says so instead of plotting nothing when no account is tax-free", () => {
    render(
      <ProjectionChart
        points={[
          { age: 36, free: 0, year: 2026 },
          { age: 37, free: 0, year: 2027 },
        ]}
      />,
    );

    expect(screen.getByText("—")).toHaveClass("figure");
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Add a tax-free account to see it projected.",
    );
    expect(screen.queryByRole("application")).not.toBeInTheDocument();
  });

  it("has nothing to plot over no years either", () => {
    render(<ProjectionChart points={[]} />);

    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Add a tax-free account to see it projected.",
    );
  });
});

describe("ProjectionPending", () => {
  it("holds the chart's frame while the store answers", () => {
    render(<ProjectionPending />);

    expect(screen.getByText("Tax-free")).toHaveClass("label");
    expect(screen.getByText("—")).toHaveClass("figure");
    expect(screen.getByRole("paragraph")).toHaveTextContent(
      "Reading the store…",
    );
  });
});
