import type { JSX } from "react";

import { IncomeSchedule } from "@/components/income-schedule";
import { ScreenHeader } from "@/components/screen-header";
import { plan as planScreen, sectionLabel } from "@/lib/nav";

import { getPlan } from "../store";
import { getIncomeLines } from "./store";

// The reference's plan screen holds accounts, events and the income and
// expense schedules on three tabs. The accounts have a screen of their
// own here and the events wait, so the schedules are what this screen is,
// with no tab strip until there is a second tab to switch to: the income
// lines now, the expense lines to follow beneath them. The page reads the
// lines from the store, which reads the session first, so it renders
// behind the loading screen beside it, and lays them over the plan the
// projection runs on. The header is the page's rather than the
// schedule's, since it will count both. The plan is read after the
// lines, as the projection reads it after the accounts: the read behind
// the session makes the route dynamic, and the plan's year has to be
// read at request time rather than while the shell is prerendered.
export default async function Plan(): Promise<JSX.Element> {
  const lines = await getIncomeLines();
  const plan = getPlan();
  return (
    <>
      <ScreenHeader label={sectionLabel(planScreen)} title="Income & expenses">
        {counted(lines.length)}
      </ScreenHeader>
      <div className="grid gap-5 p-8">
        <IncomeSchedule lines={lines} plan={plan} />
      </div>
    </>
  );
}

// The header's count, one line in the singular.
function counted(count: number): string {
  return `${String(count)} income ${count === 1 ? "line" : "lines"}`;
}
