"use client";

import { cn } from "cn";
import * as React from "react";
import * as RechartsPrimitive from "recharts";

const INITIAL_DIMENSION = { height: 200, width: 320 } as const;

// The chart's series by key, each with the colour its marks take and the
// name the legend shows for it. The colour is any CSS value, so a series
// names a theme token and follows the theme without the chart knowing
// which it is in.
type ChartConfig = Record<string, { color: string; label?: React.ReactNode }>;

interface ChartContextProps {
  config: ChartConfig;
}

const ChartContext = React.createContext<ChartContextProps | null>(null);

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
    <ChartContext value={{ config }}>
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
    </ChartContext>
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

function useChart(): ChartContextProps {
  const context = React.use(ChartContext);

  if (context === null) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }

  return context;
}

const ChartTooltip = RechartsPrimitive.Tooltip;

const ChartLegend = RechartsPrimitive.Legend;

// Each series the chart drew, keyed by a swatch of its colour and named
// from the config. A series' key is its data key unless a name key is
// given, and one drawn with no legend type is left out.
function ChartLegendContent({
  className,
  nameKey,
  payload,
  position,
}: React.ComponentProps<"div"> &
  RechartsPrimitive.DefaultLegendContentProps & {
    nameKey?: string;
    position?: RechartsPrimitive.CartesianPosition;
  }): null | React.JSX.Element {
  const { config } = useChart();

  if (payload === undefined || payload.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4",
        position === "top" ? "pb-3" : "pt-3",
        className,
      )}
      data-slot="chart-legend"
    >
      {payload
        .filter((item) => item.type !== "none")
        .map((item) => {
          const key =
            nameKey ??
            (typeof item.dataKey === "string" ? item.dataKey : "value");

          return (
            <div
              className="flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground"
              key={key}
            >
              <div
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
              {config[key]?.label}
            </div>
          );
        })}
    </div>
  );
}

export { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip };
