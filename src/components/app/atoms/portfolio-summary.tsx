import type { JSX } from "react";

import { formatCurrency } from "@/lib/money";
import { formatDated, formatDay } from "@/lib/months";

interface PortfolioSummaryProps {
  readonly holdingsCount: number;
  readonly latestQuoteDate: null | string;
  readonly today: string;
  readonly totalCash: number;
  readonly totalInvested: number;
}

// The four bookkeeping readings across the top of the Portfolio screen,
// laid out in one strip as SourceDates and BalanceDates are: invested
// value, uninvested cash, held security count, and the date of the
// newest quote with its age against the day given.
export function PortfolioSummary({
  holdingsCount,
  latestQuoteDate,
  today,
  totalCash,
  totalInvested,
}: PortfolioSummaryProps): JSX.Element {
  const items = [
    {
      isFigure: true,
      name: "Invested",
      value: formatCurrency(totalInvested, "GBP"),
    },
    {
      isFigure: true,
      name: "Uninvested cash",
      value: formatCurrency(totalCash, "GBP"),
    },
    {
      isFigure: false,
      name: "Holdings",
      value: `${String(holdingsCount)} ${holdingsCount === 1 ? "security" : "securities"}`,
    },
    {
      isFigure: false,
      name: "Quotes to",
      value: quotesValueOf(latestQuoteDate, today),
    },
  ];
  return (
    <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      {items.map(({ isFigure, name, value }) => (
        <div className="grid gap-1" key={name}>
          <dt className="label text-muted-foreground">{name}</dt>
          <dd className={isFigure ? "figure" : undefined}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// The quote freshness reading: plain date when ahead of today (timezone
// skew), relative age otherwise, or a plain note when no quotes exist.
function quotesValueOf(latestQuoteDate: null | string, today: string): string {
  if (latestQuoteDate === null) {
    return "No quotes yet";
  }
  return latestQuoteDate > today
    ? formatDay(latestQuoteDate)
    : formatDated(latestQuoteDate, today);
}
