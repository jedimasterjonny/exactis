import type { JSX } from "react";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { CashFlowCard } from "@/components/app/organisms/cash-flow-card";
import { ExpenseSchedule } from "@/components/app/organisms/expense-schedule";
import { IncomeSchedule } from "@/components/app/organisms/income-schedule";
import { MilestoneList } from "@/components/app/organisms/milestone-list";
import { markersOf } from "@/data/milestones";
import { counted } from "@/lib/count";
import { plan as planScreen, sectionLabel } from "@/lib/nav";
import {
  getAccounts,
  getExpenseLines,
  getIncomeLines,
  getMilestones,
  getOwners,
  getPlan,
} from "@/store/household";

// The reference's plan screen holds accounts, events and the income and
// expense schedules on three tabs. The accounts have a screen of their
// own here, and the events are the milestones, which are laid out on the
// same span as the lines rather than on a tab of their own, so this
// screen is one column with no tab strip: the milestones first, since
// the lines are laid out by them, then the income lines, the expense
// lines beneath them, and beneath both what a month of a year leaves
// once the accounts are paid, which the card reads from the two
// schedules and the accounts together for whichever year it is set to.
// The page reads all of it from the store, which reads the session
// first, so it renders behind the loading screen beside it, and lays the
// milestones and the lines over the plan the projection runs on. The
// milestones take both schedules, to say which lines are tied to each,
// and each schedule takes the milestones, to name them and offer them;
// the income schedule takes the accounts too, for the pension a salary
// may feed, and the owners, for the one a salary opens to belong to.
// The header counts the milestones, retirement among them, and both
// schedules, so it is the page's rather than any card's. The plan is
// read beside the rest, from the same version of the household.
export default async function Plan(): Promise<JSX.Element> {
  const [incomeLines, expenseLines, accounts, milestones, owners, plan] =
    await Promise.all([
      getIncomeLines(),
      getExpenseLines(),
      getAccounts(),
      getMilestones(),
      getOwners(),
      getPlan(),
    ]);
  return (
    <>
      <ScreenHeader label={sectionLabel(planScreen)} title={planScreen.title}>
        {[
          counted(markersOf(milestones, plan).length, "milestone"),
          counted(incomeLines.length, "income line"),
          counted(expenseLines.length, "expense line"),
        ].join(" · ")}
      </ScreenHeader>
      <ScreenBody>
        <MilestoneList
          milestones={milestones}
          plan={plan}
          schedule={{ expenses: expenseLines, income: incomeLines }}
        />
        <IncomeSchedule
          accounts={accounts}
          lines={incomeLines}
          milestones={milestones}
          owners={owners}
          plan={plan}
        />
        <ExpenseSchedule
          lines={expenseLines}
          milestones={milestones}
          plan={plan}
        />
        <CashFlowCard
          accounts={accounts}
          milestones={milestones}
          plan={plan}
          schedule={{ expenses: expenseLines, income: incomeLines }}
        />
      </ScreenBody>
    </>
  );
}
