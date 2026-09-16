import type { JSX } from "react";

import { cn } from "cn";

import type { CashFlow, Take } from "@/engine/cash-flow";

import { Card, CardContent, CardHeader } from "@/components/kit/card";
import { formatGbp } from "@/lib/money";
import { plan as planScreen, sectionNumeral } from "@/lib/nav";

interface CashFlowCardProps {
  readonly flow: CashFlow;
  readonly year: number;
}

interface RowProps {
  readonly amount: number;
  readonly detail?: string;
  readonly isTotal?: boolean;
  readonly label: string;
}

// The plan screen's third card, beneath the two schedules it is read
// from: a month of this year's money, as the engine works it out, laid
// out as a ledger. The income comes in, the expenses and every account
// paid go out, each account under its name with how it is paid, and
// what is left closes the list, in the loss tone when the month does
// not cover its outgoings. The card takes the next numeral off the
// screen's after the expense card's.
export function CashFlowCard({ flow, year }: CashFlowCardProps): JSX.Element {
  return (
    <Card>
      <CardHeader className="grid gap-1">
        <span className="label text-muted-foreground">
          {`Sect. ${sectionNumeral(planScreen)}.iii`}
        </span>
        <h2 className="font-heading text-base font-medium">
          Cash flow each month
        </h2>
        <span className="text-sm text-muted-foreground">
          {`${String(year)}, in today's money`}
        </span>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          <Row amount={flow.income} label="Income" />
          <Row amount={-flow.expenses} label="Expenses" />
          {flow.fixed.map((paid) => (
            <Row
              amount={-paid.amount}
              detail="A fixed sum"
              key={paid.account.id}
              label={paid.account.name}
            />
          ))}
          {flow.spare.map((take) => (
            <Row
              amount={-take.amount}
              detail={describeTake(take)}
              key={take.account.id}
              label={take.account.name}
            />
          ))}
          <Row amount={flow.left} isTotal label="Left over" />
        </ul>
      </CardContent>
    </Card>
  );
}

// An account paid the spare money says the most it takes a year, so a
// month's take is read against it.
function describeTake(take: Take): string {
  return take.cap === null
    ? "Spare money, uncapped"
    : `Spare money, to ${formatGbp(take.cap)} / yr`;
}

// A figure that rounds to nothing is written as nothing, without the
// sign Intl gives a negative zero or a fraction of a pound going out.
function isZero(amount: number): boolean {
  return Math.round(amount) === 0;
}

// A line of the ledger: the name and, beneath it, how the money is
// paid; the figure to the right in mono, a real minus on what goes
// out and none on nothing. The total is the row that matters, so it is
// weighted, and in the loss tone when it is a shortfall, which is read
// off the figure shown: a fraction of a pound short is written as
// nothing and is not toned as a loss.
function Row({
  amount,
  detail,
  isTotal = false,
  label,
}: RowProps): JSX.Element {
  return (
    <li className="flex items-baseline justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <span className="grid gap-0.5">
        <span className={isTotal ? "font-medium" : undefined}>{label}</span>
        {detail !== undefined && (
          <span className="text-xs text-muted-foreground">{detail}</span>
        )}
      </span>
      <span
        className={cn(
          "figure",
          isTotal && "font-medium",
          isTotal && !isZero(amount) && amount < 0 && "text-destructive",
        )}
      >
        {formatGbp(isZero(amount) ? 0 : amount)}
      </span>
    </li>
  );
}
