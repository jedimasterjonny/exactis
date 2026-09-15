"use client";

import { cn } from "cn";
import * as React from "react";
import * as RechartsPrimitive from "recharts";

const INITIAL_DIMENSION = { height: 200, width: 320 } as const;

// The chart's series by key, each with the colour its marks take. The
// colour is any CSS value, so a series names a theme token and follows
// the theme without the chart knowing which it is in.
type ChartConfig = Record<string, { color: string }>;

function ChartContainer({
  children,
  className,
  config,
  id,
  initialDimension = INITIAL_DIMENSION,
  ...props
}: React.ComponentProps<"div"> & {
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
  config: ChartConfig;
  initialDimension?: { height: number; width: number };
}): React.JSX.Element {
  const uniqueId = React.useId();
  const chartId = `chart-${id ?? uniqueId}`;

  return (
    <div
      className={cn(
        "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
        className,
      )}
      data-chart={chartId}
      data-slot="chart"
      {...props}
    >
      <ChartStyle config={config} id={chartId} />
      <RechartsPrimitive.ResponsiveContainer
        initialDimension={initialDimension}
      >
        {children}
      </RechartsPrimitive.ResponsiveContainer>
    </div>
  );
}

// Each series' colour as a custom property scoped to this chart, so a
// mark refers to its series by key. The sheet is the element's text
// rather than set as raw HTML: React writes a style element's text through
// unescaped on the server, and the id it interpolates is an identifier.
function ChartStyle({
  config,
  id,
}: {
  readonly config: ChartConfig;
  readonly id: string;
}): null | React.JSX.Element {
  const series = Object.entries(config);

  if (series.length === 0) {
    return null;
  }

  return (
    <style>
      {`[data-chart=${id}] {\n${series
        .map(([key, item]) => `  --color-${key}: ${item.color};`)
        .join("\n")}\n}`}
    </style>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;

export { ChartContainer, ChartTooltip };
