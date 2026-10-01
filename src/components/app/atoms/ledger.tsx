import type { JSX } from "react";

interface LedgerProps {
  readonly steps: readonly Step[];
  readonly total: string;
  readonly totalName: string;
}

// A step of a ledger: its name, what its figure rests on, and the
// figure.
interface Step {
  readonly detail: string;
  readonly figure: string;
  readonly label: string;
}

// A figure laid out as the steps it is worked out in: each step a line,
// its name and, beneath it, what its figure rests on, the figure to the
// right, and the figure they come to closing the ledger beneath a rule,
// under its name and large in the mono face. The steps are a list, so a
// screen reader counts them.
export function Ledger({ steps, total, totalName }: LedgerProps): JSX.Element {
  return (
    <div className="grid content-start">
      <ul className="divide-y border-b">
        {steps.map(({ detail, figure, label }) => (
          <li
            className="flex items-baseline justify-between gap-4 py-4 first:pt-0"
            key={label}
          >
            <span className="grid gap-1">
              <span>{label}</span>
              <span className="text-sm text-muted-foreground">{detail}</span>
            </span>
            <span className="figure">{figure}</span>
          </li>
        ))}
      </ul>
      <p className="flex items-baseline justify-between gap-4 pt-6">
        <span className="label text-muted-foreground">{totalName}</span>
        <span className="figure text-3xl font-medium">{total}</span>
      </p>
    </div>
  );
}
