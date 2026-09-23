"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { useState } from "react";

import type { Account } from "@/data/accounts";
import type { Plan } from "@/data/plan";
import type { Fed, Schedule, Spent, Take } from "@/engine/cash-flow";

import { Field } from "@/components/app/atoms/field";
import { SectionHeader } from "@/components/app/atoms/section-header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/kit/accordion";
import { Card, CardContent, CardHeader } from "@/components/kit/card";
import { Slider } from "@/components/kit/slider";
import { endYear } from "@/data/plan";
import { cashFlow } from "@/engine/cash-flow";
import { cadenceAbbreviations } from "@/lib/cadence";
import { spanOf } from "@/lib/lines";
import { formatGbp } from "@/lib/money";
import { monthName } from "@/lib/months";
import { plan as planScreen, subsectionLabel } from "@/lib/nav";

interface CashFlowCardProps {
  readonly accounts: readonly Account[];
  readonly plan: Plan;
  readonly schedule: Schedule;
}

interface FigureProps {
  readonly amount: number;
  readonly isTotal?: boolean;
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
// something else. The month shown is the first the plan runs in that
// year, the month the plan is read in for its first year and January
// after, and the title names it, since a line may end part way through
// a year and a later month of it would leave something else again. The
// card runs the engine itself, which is pure and cheap, rather than
// asking the page for every year. The income comes
// in, as it is earned, then what a salary sacrifices into its pension
// comes off it, under the pension's name with the salary it is fed
// from and what lands with the NI saved, then the income tax and the
// National Insurance on what is left of it, then the expenses and every
// account paid go out, each account under its name with how it is
// paid, and what is left closes the list, in the loss tone when the
// month does not cover its outgoings. The
// expenses figure opens into the lines behind it, each under its name
// with what it is paid at and the years it runs, since a sum over a
// schedule that starts and ends line by line is a question as often as
// an answer. The card takes the next numeral off the screen's after the
// expense card's.
export function CashFlowCard({
  accounts,
  plan,
  schedule,
}: CashFlowCardProps): JSX.Element {
  const [year, setYear] = useState(plan.from);
  const end = endYear(plan);
  const month = year === plan.from ? plan.month : 0;
  const flow = cashFlow(accounts, schedule, { at: { month, year }, plan });
  return (
    <Card>
      <CardHeader className="grid gap-4">
        <SectionHeader
          label={subsectionLabel(planScreen, 3)}
          title="Cash flow each month"
        >
          {`${monthName(month, "long")} ${String(year)}, age ${String(year - plan.born)}, in today's money`}
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
          {flow.fed.map((fed) => (
            <Row
              amount={-fed.sacrificed}
              detail={describeFed(fed)}
              key={`fed-${String(fed.line.id)}`}
              label={fed.account.name}
            />
          ))}
          <Row amount={-flow.incomeTax} label="Income tax" />
          <Row amount={-flow.insurance} label="National Insurance" />
          <Expenses amount={flow.expenses} spent={flow.spent} />
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

// Which salary a pension is fed from and what lands in it, which is
// more than comes off the month by the NI saved, beneath the pension's
// name.
function describeFed({ amount, line }: Fed): string {
  return `Salary sacrifice from ${line.name}, paid in as ${formatGbp(amount)} with the NI saved`;
}

// What a line is paid at and the years it runs, "£3,500 / mo ·
// 2026–2047", beneath its name in the breakdown.
function describeSpent({ line }: Spent): string {
  return `${formatGbp(line.amount)} / ${cadenceAbbreviations[line.cadence]} · ${spanOf(line)}`;
}

// An account paid the spare money says the most it takes a year, so a
// month's take is read against it.
function describeTake(take: Take): string {
  return take.cap === null
    ? "Spare money, uncapped"
    : `Spare money, to ${formatGbp(take.cap)} / yr`;
}

// The expenses line of the ledger, which is a row until it is opened
// and then the lines behind it as well, each a row of its own in a list
// beneath the figure: the trigger is drawn as the row is, so the ledger
// reads the same closed, and the panel lists what the month is paying,
// or says when it is paying nothing.
function Expenses({
  amount,
  spent,
}: {
  readonly amount: number;
  readonly spent: readonly Spent[];
}): JSX.Element {
  return (
    <li className="py-3">
      <Accordion>
        <AccordionItem value="expenses">
          <AccordionTrigger className="gap-3 py-0 font-normal hover:no-underline">
            <span className="flex flex-1 items-baseline justify-between gap-4">
              <span>Expenses</span>
              <Figure amount={-amount} />
            </span>
          </AccordionTrigger>
          <AccordionContent className="pb-0">
            {spent.length === 0 ? (
              <p className="pt-3 text-xs text-muted-foreground">
                No expense line runs this month.
              </p>
            ) : (
              <ul className="mt-3 divide-y border-t pl-4">
                {spent.map((entry) => (
                  <Row
                    amount={-entry.amount}
                    detail={describeSpent(entry)}
                    key={entry.line.id}
                    label={entry.line.name}
                  />
                ))}
              </ul>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </li>
  );
}

// A figure of the ledger, in mono, with a real minus on what goes out
// and none on nothing. The total is weighted, and in the loss tone when
// it is a shortfall, which is read off the figure shown: a fraction of
// a pound short is written as nothing and is not toned as a loss.
function Figure({ amount, isTotal = false }: FigureProps): JSX.Element {
  return (
    <span
      className={cn(
        "figure",
        isTotal && "font-medium",
        isTotal && !isZero(amount) && amount < 0 && "text-destructive",
      )}
    >
      {formatGbp(isZero(amount) ? 0 : amount)}
    </span>
  );
}

// A figure that rounds to nothing is written as nothing, without the
// sign Intl gives a negative zero or a fraction of a pound going out.
function isZero(amount: number): boolean {
  return Math.round(amount) === 0;
}

// A line of the ledger: the name and, beneath it, how the money is
// paid; the figure to the right. The total is the row that matters, so
// its name is weighted as its figure is.
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
      <Figure amount={amount} isTotal={isTotal} />
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
