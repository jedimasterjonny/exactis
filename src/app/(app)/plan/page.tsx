import type { JSX } from "react";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { CashFlowCard } from "@/components/app/organisms/cash-flow-card";
import { ExpenseSchedule } from "@/components/app/organisms/expense-schedule";
import { IncomeSchedule } from "@/components/app/organisms/income-schedule";
import { counted } from "@/lib/count";
import { plan as planScreen, sectionLabel } from "@/lib/nav";
import {
  getAccounts,
  getExpenseLines,
  getIncomeLines,
  getOwners,
  getPlan,
} from "@/store/household";

// The reference's plan screen holds accounts, events and the income and
// expense schedules on three tabs. The accounts have a screen of their
// own here and the events wait, so the schedules are what this screen is,
// with no tab strip until there is a second tab to switch to: the income
// lines, the expense lines beneath them, and beneath both what a month
// of a year leaves once the accounts are paid, which the card reads from
// the two schedules and the accounts together for whichever year it is
// set to. The page reads all three from the store, which reads the
// session first, so it renders behind the loading screen beside it, and
// lays the lines over the plan the projection runs on; the income
// schedule takes the accounts too, for the pension a salary may feed,
// and the owners, for the one a salary opens to belong to.
// The header counts both schedules, so it is the page's rather than
// either's. The plan is read beside the lines, from the same version
// of the household.
export default async function Plan(): Promise<JSX.Element> {
  const [incomeLines, expenseLines, accounts, owners, plan] = await Promise.all(
    [
      getIncomeLines(),
      getExpenseLines(),
      getAccounts(),
      getOwners(),
      getPlan(),
    ],
  );
  return (
    <>
      <ScreenHeader label={sectionLabel(planScreen)} title="Income & expenses">
        {`${counted(incomeLines.length, "income line")} · ${counted(expenseLines.length, "expense line")}`}
      </ScreenHeader>
      <ScreenBody>
        <IncomeSchedule
          accounts={accounts}
          lines={incomeLines}
          owners={owners}
          plan={plan}
        />
        <ExpenseSchedule lines={expenseLines} plan={plan} />
        <CashFlowCard
          accounts={accounts}
          plan={plan}
          schedule={{ expenses: expenseLines, income: incomeLines }}
        />
      </ScreenBody>
    </>
  );
}
