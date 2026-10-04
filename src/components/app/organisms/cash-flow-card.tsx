"use client";

import type { JSX } from "react";

import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import type { StripYear } from "@/components/app/atoms/year-strip";
import type { Account } from "@/data/accounts";
import type { Marker, Milestone } from "@/data/milestones";
import type { Plan } from "@/data/plan";
import type { Fed, Paid, Schedule, Spent, Take } from "@/engine/cash-flow";
import type { ProjectionPoint } from "@/engine/projection";

import { MilestoneChips } from "@/components/app/atoms/milestone-chips";
import { RowAction } from "@/components/app/atoms/row-action";
import { SpanRuler } from "@/components/app/atoms/span-ruler";
import { YearStrip } from "@/components/app/atoms/year-strip";
import { SectionCard } from "@/components/app/molecules/section-card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/kit/accordion";
import { CardContent } from "@/components/kit/card";
import { markersOf, yearsOf } from "@/data/milestones";
import { ageIn, endYear } from "@/data/plan";
import { cashFlow, inTodaysMoney, totalsOf } from "@/engine/cash-flow";
import { project } from "@/engine/projection";
import { cadenceAbbreviations } from "@/lib/cadence";
import { listed } from "@/lib/feeders";
import { growthLabels, spanOf } from "@/lib/lines";
import { formatGbp } from "@/lib/money";
import { monthName } from "@/lib/months";
import { plan as planScreen, subsectionLabel } from "@/lib/nav";
import { laneColumns } from "@/lib/span";

// What every year of the book reads the plan by: the accounts and the
// schedule the engine runs on, the plan, its milestones within its span,
// and the projection's years, for what each leaves uncovered.
interface Book {
  readonly accounts: readonly Account[];
  readonly markers: readonly Marker[];
  readonly plan: Plan;
  readonly points: readonly ProjectionPoint[];
  readonly schedule: Schedule;
}

interface CashFlowCardProps {
  readonly accounts: readonly Account[];
  readonly milestones: readonly Milestone[];
  readonly plan: Plan;
  readonly schedule: Schedule;
}

interface FigureProps {
  readonly amount: number;
  readonly isLoss?: boolean;
  readonly isTotal?: boolean;
}

interface LedgerProps {
  readonly book: Book;
  readonly onYear: (year: number) => void;
  readonly year: number;
}

interface RowProps {
  readonly amount: number;
  readonly detail?: string;
  readonly isLoss?: boolean;
  readonly isTotal?: boolean;
  readonly label: string;
}

// The plan screen's fourth card, beneath the two schedules it is read
// from: the plan year by year, as one strip on the span the lines above
// are laid on, ruled in decades as their span is. Each year is a column
// of what a month of it puts by, rising from a rule, or draws from the
// savings, hanging beneath it, as the engine works them out in today's
// money, so the plan's shape is seen at once: the years saving, the year
// the savings start paying the month, and how the sums move between,
// gently as payments fixed in pounds shrink and in a step as a line
// starts or stops. A year the projection runs out of savings in draws in
// the loss tone, since only then is a draw a failure rather than the
// plan spending what it saved. The strip is the slider that chooses a
// year, opening on the plan's first, and the chosen year's figure and
// age stand beside it in the lanes' columns, with the milestones as
// chips beneath that jump to their years, since on a phone a year is a
// few pixels wide. Beneath them all is the chosen year's month, line by
// line, which steps a year at a time either way. The card runs the
// engine itself, which is pure and cheap, a month a year and the
// projection once. While the strip is too narrow to read across, as on a
// phone, it runs the card's width, with the year's figure beneath it.
// The card takes the next numeral off the screen's after the expense
// card's.
export function CashFlowCard({
  accounts,
  milestones,
  plan,
  schedule,
}: CashFlowCardProps): JSX.Element {
  const [year, setYear] = useState(plan.from);
  const end = endYear(plan);
  const markers = markersOf(milestones, plan).filter(
    (marker) => marker.year >= plan.from && marker.year <= end,
  );
  const book: Book = {
    accounts,
    markers,
    plan,
    points: project(accounts, schedule, plan),
    schedule,
  };
  const chosen = yearOf(year, book);
  const net = netOf(chosen);
  return (
    <SectionCard
      caption="What a month of each year puts by, rising from the rule, or draws from the savings, hanging beneath it, in today's money, on the span the lines above are laid on. Drag along it, choose a milestone or step a year at a time to read the month line by line."
      label={subsectionLabel(planScreen, 4)}
      title="Year by year"
    >
      <CardContent className="@container grid gap-4">
        <div
          className={cn("grid gap-x-4 gap-y-1 folded:grid-cols-1", laneColumns)}
        >
          <SpanRuler plan={plan} />
          <span className="col-start-1">
            <YearStrip
              label="Year"
              marks={yearsOf(markers)}
              onValueChange={setYear}
              plan={plan}
              value={year}
              valueText={(at) => {
                const { name, sum } = netOf(yearOf(at, book));
                return `${String(at)}, age ${String(ageIn(at, plan))}: ${formatGbp(sum)} a month ${name}`;
              }}
              years={Array.from({ length: end - plan.from + 1 }, (_, offset) =>
                yearOf(plan.from + offset, book),
              )}
            />
          </span>
          <span className="flex items-baseline justify-between gap-3 self-center unfolded:contents">
            <span className="grid gap-0.5 self-center unfolded:text-right">
              <span
                className={cn(
                  "figure font-medium",
                  chosen.isShort && !isZero(chosen.drawn) && "text-destructive",
                )}
              >
                {`${formatGbp(net.sum)} / mo`}
              </span>
              <span className="text-xs text-muted-foreground">{net.name}</span>
            </span>
            <span className="grid gap-0.5 self-center text-right">
              <span className="figure">{year}</span>
              <span className="label text-muted-foreground/60">
                {`Age ${String(ageIn(year, plan))}`}
              </span>
            </span>
          </span>
        </div>
        {markers.length > 0 && (
          <MilestoneChips
            markers={markers}
            onSelect={(tie) => {
              for (const marker of markers) {
                if (marker.id === tie) {
                  setYear(marker.year);
                }
              }
            }}
            selected={markers.find((marker) => marker.year === year)?.id}
          />
        )}
        <MonthLedger book={book} onYear={setYear} year={year} />
      </CardContent>
    </SectionCard>
  );
}

// What closes the ledger: what is left over, and what becomes of it, or
// what the month is short by and where that comes from, in the loss tone
// and saying what is left uncovered when the savings run out in the
// year. A fraction of a pound short is read as nothing left over, as
// the figure shown is.
function Closing({
  left,
  uncovered,
}: {
  readonly left: number;
  readonly uncovered: number;
}): JSX.Element {
  if (isZero(left) || left > 0) {
    return (
      <Row
        amount={left}
        detail="What no saving takes is left in the month, which the plan takes as spent."
        isTotal
        label="Left over"
      />
    );
  }
  return (
    <Row
      amount={-left}
      detail={
        uncovered > 0
          ? `The savings run out this year, leaving ${formatGbp(uncovered)} of it uncovered.`
          : "What the month is short by is drawn from the savings, cash first."
      }
      isLoss={uncovered > 0}
      isTotal
      label="Short"
    />
  );
}

// Which salary a pension is fed from and what lands in it, which is
// more than comes off the month by the NI saved, beneath the pension's
// name.
function describeFed({ amount, line }: Fed): string {
  return `Salary sacrifice from ${line.name}, paid in as ${formatGbp(amount)} with the NI saved`;
}

// What a line is paid at, how that grows and the years it runs, "£2,245
// / mo · Fixed in pounds · 2026–Jul 2047", beneath its name in the
// breakdown, so a line fixed in pounds is read as the reason its figure
// in today's money is the smaller.
function describeSpent({ line }: Spent): string {
  return `${formatGbp(line.amount)} / ${cadenceAbbreviations[line.cadence]} · ${growthLabels[line.growth]} · ${spanOf(line)}`;
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
// its row says it is one.
function Figure({
  amount,
  isLoss = false,
  isTotal = false,
}: FigureProps): JSX.Element {
  return (
    <span
      className={cn(
        "figure",
        isTotal && "font-medium",
        isLoss && "text-destructive",
      )}
    >
      {formatGbp(isZero(amount) ? 0 : amount)}
    </span>
  );
}

// Whether a payment is one the month makes, rather than one that rounds
// to nothing.
function isPaid({ amount }: Paid): boolean {
  return !isZero(amount);
}

// A figure that rounds to nothing is written as nothing, without the
// sign Intl gives a negative zero or a fraction of a pound going out.
function isZero(amount: number): boolean {
  return Math.round(amount) === 0;
}

// A year's month laid out as a ledger, line by line: the month and the
// age, and the milestones falling in its year, then the income coming
// in, then what a salary sacrifices into its pension, under the
// pension's name with the salary it is fed from and what lands with the
// NI saved, then the income tax and the National Insurance on what is
// left of it, then the expenses, opening into the lines behind them, and
// every account paid, each under its name with how it is paid and a
// pension with what lands once the basic rate is claimed back on it, the
// accounts the month pays nothing named together on one line rather
// than a column of nothings burying the ones it pays, and what is left
// or short closing the list. The month is the first the
// plan runs in the year, the month the plan starts in for its first year
// and January after, and the year steps either way across the plan, as
// the strip does. Every figure is in today's money. The month is said
// aloud as it steps.
function MonthLedger({ book, onYear, year }: LedgerProps): JSX.Element {
  const { accounts, markers, plan, points, schedule } = book;
  const month = year === plan.from ? plan.month : 0;
  const reading = { at: { month, year }, plan };
  const flow = inTodaysMoney(cashFlow(accounts, schedule, reading), reading);
  const marked = markers
    .filter((marker) => marker.year === year)
    .map(({ name }) => name);
  const unpaid = [...flow.fixed, ...flow.spare].filter((paid) => !isPaid(paid));
  return (
    <div className="grid gap-3 rounded-md bg-muted/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <span aria-live="polite" className="text-sm text-muted-foreground">
          {[
            `${monthName(month, "long")} ${String(year)}, age ${String(ageIn(year, plan))}, in today's money`,
            ...(marked.length === 0 ? [] : [listed.format(marked)]),
          ].join(" · ")}
        </span>
        <span className="flex shrink-0 gap-1">
          <RowAction
            disabled={year === plan.from}
            icon={ChevronLeft}
            name="Year before"
            onClick={() => {
              onYear(year - 1);
            }}
          />
          <RowAction
            disabled={year === endYear(plan)}
            icon={ChevronRight}
            name="Year after"
            onClick={() => {
              onYear(year + 1);
            }}
          />
        </span>
      </div>
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
        {flow.fixed.filter(isPaid).map((paid) => (
          <Row
            amount={-paid.amount}
            detail={relieved("A fixed sum", paid, flow.relief)}
            key={paid.account.id}
            label={paid.account.name}
          />
        ))}
        {flow.spare.filter(isPaid).map((take) => (
          <Row
            amount={-take.amount}
            detail={relieved(describeTake(take), take, flow.relief)}
            key={take.account.id}
            label={take.account.name}
          />
        ))}
        {unpaid.length > 0 && (
          <Row
            amount={0}
            detail={listed.format(unpaid.map(({ account }) => account.name))}
            label="Paid nothing this month"
          />
        )}
        <Closing
          left={flow.left}
          uncovered={points
            .filter((point) => point.year === year)
            .reduce((sum, point) => sum + point.uncovered, 0)}
        />
      </ul>
    </div>
  );
}

// What a year's month comes to, as one figure: what it draws from the
// savings when it draws anything, which a month short does, and
// otherwise what it puts by. A draw of less than a pound is none, as the
// ledger writes it.
function netOf({ drawn, saved }: StripYear): {
  readonly name: string;
  readonly sum: number;
} {
  return isZero(drawn)
    ? { name: "put by", sum: saved }
    : { name: "drawn from the savings", sum: drawn };
}

// How an account is paid, and for a pension what lands in it once the
// basic rate is claimed back on what the month paid, "A fixed sum, paid
// in as £1,000 with basic-rate relief", which is more than comes off
// the month as a sacrifice's feed is. The relief is the flow's, which
// claims it on no more than its owner's earnings relieve. An account
// that claims nothing, and a pension the month paid nothing or whose
// owner has no relief left, says how it is paid alone.
function relieved(
  how: string,
  { account, amount }: Paid,
  relief: readonly Paid[],
): string {
  const claimed = relief
    .filter((entry) => entry.account === account)
    .reduce((sum, entry) => sum + entry.amount, 0);
  return isZero(claimed)
    ? how
    : `${how}, paid in as ${formatGbp(amount + claimed)} with basic-rate relief`;
}

// A line of the ledger: the name and, beneath it, how the money is
// paid; the figure to the right. The total is the row that matters, so
// its name is weighted as its figure is.
function Row({
  amount,
  detail,
  isLoss = false,
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
      <Figure amount={amount} isLoss={isLoss} isTotal={isTotal} />
    </li>
  );
}

// A year as the strip draws it, from a month of it, the first the plan
// runs in the year, in today's money, and whether the projection runs
// out of savings in it.
function yearOf(
  year: number,
  { accounts, plan, points, schedule }: Book,
): StripYear {
  const month = year === plan.from ? plan.month : 0;
  const reading = { at: { month, year }, plan };
  const { drawn, saved } = totalsOf(
    inTodaysMoney(cashFlow(accounts, schedule, reading), reading),
  );
  return {
    drawn,
    isShort: points.some((point) => point.year === year && point.uncovered > 0),
    saved,
    year,
  };
}
