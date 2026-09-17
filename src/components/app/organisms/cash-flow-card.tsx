"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { useState } from "react";

import type { Account } from "@/data/accounts";
import type { Schedule, Take } from "@/engine/cash-flow";
import type { Plan } from "@/engine/projection";

import { Field } from "@/components/app/atoms/field";
import { SectionHeader } from "@/components/app/atoms/section-header";
import { Card, CardContent, CardHeader } from "@/components/kit/card";
import { Slider } from "@/components/kit/slider";
import { cashFlow } from "@/engine/cash-flow";
import { endYear } from "@/engine/projection";
import { formatGbp } from "@/lib/money";
import { plan as planScreen, subsectionLabel } from "@/lib/nav";

interface CashFlowCardProps {
  readonly accounts: readonly Account[];
  readonly plan: Plan;
  readonly schedule: Schedule;
}

interface RowProps {
  readonly amount: number;
  readonly detail?: string;
  readonly isTotal?: boolean;
  readonly label: string;
}

// The plan screen's third card, beneath the two schedules it is read
// from: a month of a year's money, as the engine works it out, laid out
// as a ledger. The year is the card's own, opening on the plan's first
// and moved along the plan's span by the slider under the title, since
// lines start and end and overlap, so a month a decade on can leave
// something else. The card runs the engine itself, which is pure and
// cheap, rather than asking the page for every year. The income comes
// in, the expenses and every account paid go out, each account under
// its name with how it is paid, and what is left closes the list, in
// the loss tone when the month does not cover its outgoings. The card
// takes the next numeral off the screen's after the expense card's.
export function CashFlowCard({
  accounts,
  plan,
  schedule,
}: CashFlowCardProps): JSX.Element {
  const [year, setYear] = useState(plan.from);
  const end = endYear(plan);
  const flow = cashFlow(accounts, schedule, year);
  return (
    <Card>
      <CardHeader className="grid gap-4">
        <SectionHeader
          label={subsectionLabel(planScreen, 3)}
          title="Cash flow each month"
        >
          {`${String(year)}, age ${String(year - plan.born)}, in today's money`}
        </SectionHeader>
        <Field
          hint={`${String(plan.from)} to ${String(end)}, the years of the plan`}
          label="Year"
        >
          <Slider
            max={end}
            min={plan.from}
            onValueChange={(value) => {
              setYear(yearOf(value));
            }}
            step={1}
            value={[year]}
          />
        </Field>
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

// The slider holds one year, but Base UI types what it reports as a
// number or a list of them, and the vendored slider draws a thumb per
// entry of a list, so it is handed a list of one and the one is read
// back. Flattened rather than narrowed, so there is no branch for a
// shape it never takes.
function yearOf(value: number | readonly number[]): number {
  return Math.max(...[value].flat());
}
