import { render, screen } from "@testing-library/react";
import { Area, AreaChart } from "recharts";
import { describe, expect, it } from "vitest";

import { takeConsoleOutput } from "../../../vitest.setup";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "./chart";

const bySlot =
  (slot: string) =>
  (_content: string, element: Element | null): boolean =>
    element?.getAttribute("data-slot") === slot;

const points = [
  { deferred: 50, free: 100, year: 2026 },
  { deferred: 55, free: 110, year: 2027 },
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

describe("ChartLegendContent", () => {
  // The last series is keyed by a function, so it has no data key to be
  // named by and takes the fallback, which the config does not name.
  it("names each series the chart drew from the config, in drawing order", () => {
    render(
      <ChartContainer
        config={{
          deferred: { color: "var(--chart-2)", label: "Tax-deferred" },
          free: { color: "var(--chart-1)", label: "Tax-free" },
        }}
      >
        <AreaChart data={points}>
          <Area dataKey="deferred" stroke="var(--color-deferred)" />
          <Area dataKey="free" stroke="var(--color-free)" />
          <Area dataKey="year" legendType="none" />
          <Area
            dataKey={(point: (typeof points)[number]): number => point.free}
          />
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>,
    );

    expect(
      screen.getAllByText(/^Tax-/).map((name) => name.textContent),
    ).toStrictEqual(["Tax-deferred", "Tax-free"]);
    expect(screen.getByText(bySlot("chart-legend"))).toHaveClass("pt-3");
  });

  it("renders nothing for a chart with no series", () => {
    render(
      <ChartContainer config={{}}>
        <AreaChart data={points}>
          <ChartLegend content={<ChartLegendContent />} />
        </AreaChart>
      </ChartContainer>,
    );

    expect(
      screen.queryByText(/./, { ignore: "script, style" }),
    ).not.toBeInTheDocument();
  });

  it("sits above the plot when told to and takes a name key over the data key", () => {
    render(
      <ChartContainer
        config={{ wrappers: { color: "red", label: "Wrappers" } }}
      >
        <AreaChart data={points}>
          <Area dataKey="free" />
          <ChartLegend
            content={<ChartLegendContent nameKey="wrappers" />}
            position="top"
          />
        </AreaChart>
      </ChartContainer>,
    );

    expect(screen.getByText("Wrappers")).toBeInTheDocument();
    expect(screen.getByText(bySlot("chart-legend"))).toHaveClass("pb-3");
  });

  it("refuses to render outside a chart", () => {
    expect(() => render(<ChartLegendContent payload={[]} />)).toThrow(
      "useChart must be used within a <ChartContainer />",
    );
    takeConsoleOutput();
  });
});
