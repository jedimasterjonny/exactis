import type { JSX } from "react";

interface SplitBarProps {
  readonly share: number;
}

// The savings split between stocks and bonds as a bar across its row:
// stocks from the left in the deep green the chart draws them in, bonds
// after them in the lighter, a hairline of the card between so the two
// read apart where they meet. Decorative, since the split is written
// beside it, so the bar is hidden from the accessibility tree. A share
// outside the whole is held to its edge.
export function SplitBar({ share }: SplitBarProps): JSX.Element {
  const stocks = Math.min(Math.max(share, 0), 1) * 100;
  return (
    <span
      aria-hidden
      className="flex h-2 gap-0.5 overflow-hidden rounded-full"
      data-slot="split-bar"
    >
      <span
        className="block bg-chart-1"
        data-slot="split-bar-stocks"
        style={{ width: `${String(stocks)}%` }}
      />
      <span className="block flex-1 bg-chart-2" data-slot="split-bar-bonds" />
    </span>
  );
}
