import { render, screen } from "@testing-library/react";
import { Area, AreaChart } from "recharts";
import { describe, expect, it } from "vitest";

import { ChartContainer, ChartTooltip } from "./chart";

const points = [
  { free: 100, year: 2026 },
  { free: 110, year: 2027 },
];

describe("ChartContainer", () => {
  it("renders the chart under its slot with each series' colour scoped to it", () => {
    render(
      <ChartContainer
        config={{ free: { color: "var(--chart-1)" } }}
        data-testid="chart"
      >
        <AreaChart data={points}>
          <Area dataKey="free" stroke="var(--color-free)" />
          <ChartTooltip />
        </AreaChart>
      </ChartContainer>,
    );

    const chart = screen.getByTestId("chart");
    const id = chart.getAttribute("data-chart");

    expect(chart).toHaveAttribute("data-slot", "chart");
    expect(id).toMatch(/^chart-/);
    expect(
      screen.getByText(/--color-free/, { ignore: "script" }),
    ).toHaveTextContent(
      `[data-chart=${String(id)}] { --color-free: var(--chart-1); }`,
    );
    expect(screen.getByRole("application")).toHaveClass("recharts-surface");
  });

  it("takes an id of its own and writes no sheet for no series", () => {
    render(
      <ChartContainer config={{}} data-testid="chart" id="projection">
        <AreaChart data={points}>
          <Area dataKey="free" />
        </AreaChart>
      </ChartContainer>,
    );

    expect(screen.getByTestId("chart")).toHaveAttribute(
      "data-chart",
      "chart-projection",
    );
    expect(
      screen.queryByText(/--color/, { ignore: "script" }),
    ).not.toBeInTheDocument();
  });
});
