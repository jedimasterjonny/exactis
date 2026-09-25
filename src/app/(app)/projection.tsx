import type { JSX } from "react";

import { ProjectionBoard } from "@/components/app/organisms/projection-board";
import { getAccounts } from "@/store/accounts";
import { getPlan } from "@/store/plan";
import { getExpenseLines, getIncomeLines } from "@/store/schedule";

// The dashboard's projection, over the accounts, the lines and the plan
// read from the store behind the session. It is its own component so
// the page can stream it in behind the frame around it, which needs
// nothing from the store and is served as it is.
export async function Projection(): Promise<JSX.Element> {
  const [accounts, income, expenses, plan] = await Promise.all([
    getAccounts(),
    getIncomeLines(),
    getExpenseLines(),
    getPlan(),
  ]);
  return (
    <ProjectionBoard
      accounts={accounts}
      plan={plan}
      schedule={{ expenses, income }}
    />
  );
}
