import type { JSX } from "react";

import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { ExpenseSchedule } from "@/components/app/organisms/expense-schedule";
import { IncomeSchedule } from "@/components/app/organisms/income-schedule";
import { plan as planScreen, sectionLabel } from "@/lib/nav";

import { getPlan } from "../store";
import { getExpenseLines, getIncomeLines } from "./store";

// The reference's plan screen holds accounts, events and the income and
// expense schedules on three tabs. The accounts have a screen of their
// own here and the events wait, so the schedules are what this screen is,
// with no tab strip until there is a second tab to switch to: the income
// lines, and the expense lines beneath them. The page reads both from
// the store, which reads the session first, so it renders behind the
// loading screen beside it, and lays them over the plan the projection
// runs on. The header counts both, so it is the page's rather than
// either schedule's. The plan is read after the lines, as the projection
// reads it after the accounts: the reads behind the session make the
// route dynamic, and the plan's year has to be read at request time
// rather than while the shell is prerendered.
export default async function Plan(): Promise<JSX.Element> {
  const [incomeLines, expenseLines] = await Promise.all([
    getIncomeLines(),
    getExpenseLines(),
  ]);
  const plan = getPlan();
  return (
    <>
      <ScreenHeader label={sectionLabel(planScreen)} title="Income & expenses">
        {`${counted(incomeLines.length, "income")} · ${counted(expenseLines.length, "expense")}`}
      </ScreenHeader>
      <div className="grid gap-5 p-8">
        <IncomeSchedule lines={incomeLines} plan={plan} />
        <ExpenseSchedule lines={expenseLines} plan={plan} />
      </div>
    </>
  );
}

// A schedule's count for the header, one line in the singular.
function counted(count: number, side: string): string {
  return `${String(count)} ${side} ${count === 1 ? "line" : "lines"}`;
}
