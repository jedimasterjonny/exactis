import type { JSX } from "react";

import type { Account } from "@/data/accounts";
import type { Plan as Planned } from "@/data/plan";
import type { Schedule, Totals } from "@/engine/cash-flow";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { CashFlowCard } from "@/components/app/organisms/cash-flow-card";
import { ExpenseSchedule } from "@/components/app/organisms/expense-schedule";
import { IncomeSchedule } from "@/components/app/organisms/income-schedule";
import { MilestoneList } from "@/components/app/organisms/milestone-list";
import { endAge, endYear } from "@/data/plan";
import { cashFlow, inTodaysMoney, totalsOf } from "@/engine/cash-flow";
import { project } from "@/engine/projection";
import { formatGbp } from "@/lib/money";
import { plan as planScreen, sectionLabel } from "@/lib/nav";
import { getHousehold } from "@/store/household";

// The reference's plan screen holds accounts, events and the income and
// expense schedules on three tabs. The accounts have a screen of their
// own here, and the events are the milestones, which are laid out on the
// same span as the lines rather than on a tab of their own, so this
// screen is one column with no tab strip: the milestones first, since
// the lines are laid out by them, then the income lines, the expense
// lines beneath them, and beneath both the plan year by year, in
// stretches of years alike, each a month of what comes in, goes out, is
// put by and is drawn once the accounts are paid, which the card reads
// from the two schedules and the accounts together.
// The page reads all of it from the store, which reads the session
// first, so it renders behind the loading screen beside it, and lays the
// milestones and the lines over the plan the projection runs on. The
// milestones take both schedules, to say which lines are tied to each,
// and each schedule takes the milestones, to name them and offer them;
// the income schedule takes the accounts too, for the pension a salary
// may feed, and the owners, for the one a salary opens to belong to.
// The header says what the plan comes to, which is read off every card
// beneath it, so it is the page's rather than any card's. The plan is
// read beside the rest, from the same version of the household.
export default async function Plan(): Promise<JSX.Element> {
  const { accounts, milestones, owners, plan, schedule } = await getHousehold();
  return (
    <>
      <ScreenHeader label={sectionLabel(planScreen)} title={planScreen.title}>
        {headlineOf({ accounts, plan, schedule })}
      </ScreenHeader>
      <ScreenBody>
        <MilestoneList
          milestones={milestones}
          plan={plan}
          schedule={schedule}
        />
        <IncomeSchedule
          accounts={accounts}
          lines={schedule.income}
          milestones={milestones}
          owners={owners}
          plan={plan}
        />
        <ExpenseSchedule
          lines={schedule.expenses}
          milestones={milestones}
          plan={plan}
        />
        <CashFlowCard
          accounts={accounts}
          milestones={milestones}
          plan={plan}
          schedule={schedule}
        />
      </ScreenBody>
    </>
  );
}

// What the plan comes to, in a month of today's money, as the screens
// beside this one open on a figure: what a month puts by now, or draws
// from the savings when it is already short; the first year after whose
// month draws on them, and how much, since that is where the plan turns;
// and the age the savings last to, or the age and the year the
// projection runs out of them in. A year is read by a month of it, as
// the year book reads it, and a month drawing less than a pound is
// drawing nothing, as the book writes it.
function headlineOf({
  accounts,
  plan,
  schedule,
}: {
  readonly accounts: readonly Account[];
  readonly plan: Planned;
  readonly schedule: Schedule;
}): string {
  const monthIn = (year: number): Totals => {
    const month = year === plan.from ? plan.month : 0;
    const reading = { at: { month, year }, plan };
    return totalsOf(
      inTodaysMoney(cashFlow(accounts, schedule, reading), reading),
    );
  };
  const isDrawing = ({ drawn }: Totals): boolean => Math.round(drawn) > 0;
  const now = monthIn(plan.from);
  const drawing = isDrawing(now)
    ? undefined
    : Array.from(
        { length: endYear(plan) - plan.from },
        (_, offset) => plan.from + offset + 1,
      )
        .map((year) => ({ from: year, totals: monthIn(year) }))
        .find(({ totals }) => isDrawing(totals));
  const runsOut = project(accounts, schedule, plan).find(
    ({ uncovered }) => uncovered > 0,
  );
  return [
    isDrawing(now)
      ? `${formatGbp(now.drawn)} a month drawn from the savings now`
      : `${formatGbp(now.saved)} a month put by now`,
    ...(drawing === undefined
      ? []
      : [
          `${formatGbp(drawing.totals.drawn)} a month drawn from ${String(drawing.from)}`,
        ]),
    runsOut === undefined
      ? `the savings last to ${String(endAge(plan))}`
      : `the savings run out at ${String(runsOut.age)}, in ${String(runsOut.year)}`,
  ].join(" · ");
}
