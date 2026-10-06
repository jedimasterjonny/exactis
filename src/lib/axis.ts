import { getNiceTickValues } from "recharts";

// The pounds a chart's axis spans and the ticks it marks, for a plot
// reaching down to the bottom given, nothing or below it, and up to the
// top given, nothing or above it. Above nothing they are the ticks
// recharts would choose itself for the top, the last at or above it.
// Below nothing the axis reaches only as deep as the plot goes, marked
// at the same step as far as it reaches one: recharts spaces its ticks
// evenly either side of nothing, so £400,000 owed under £10m held took
// the axis down to minus £3.5m and gave a quarter of the plot to
// nothing. The step is set by the deeper of the two sides, so a plot
// below nothing alone is marked as one above nothing alone would be.
export function axisOf(
  bottom: number,
  top: number,
): { readonly domain: [number, number]; readonly ticks: number[] } {
  const nice = getNiceTickValues(
    [0, Math.max(top, -bottom)],
    5,
    true,
    "adaptive",
  );
  const step = Math.max(...nice) / (nice.length - 1);
  const above = nice.filter((tick) => tick - step < top);
  const below = Array.from(
    { length: Math.floor(-bottom / step) },
    (_, place) => -(place + 1) * step,
  ).reverse();
  return { domain: [bottom, Math.max(...above)], ticks: [...below, ...above] };
}
