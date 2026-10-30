import type { JSX } from "react";

import { BalanceDates } from "@/components/app/atoms/balance-dates";
import { MonthEnd } from "@/components/app/organisms/month-end";
import { Screen } from "@/components/app/templates/screen";
import { moveChoices } from "@/data/houses";
import { markersOf } from "@/data/milestones";
import { laidOut } from "@/engine/projection";
import { balanceOf, drawingTaxOf } from "@/lib/ledger";
import { formatGbp } from "@/lib/money";
import { formatMonth, monthBefore, thisMonth, today } from "@/lib/months";
import { accountsAndAssets, sectionLabel } from "@/lib/nav";
import { getHousehold, getOpened } from "@/store/household";

import { AccountLedger } from "./account-ledger";

// The reference's plan screen opened on its accounts tab, with that tab
// split in two: the wrappers, cash and the loans on one, the real assets on the
// other. The page reads the accounts from the store, the income lines
// with them, so the ledger can name the salaries feeding a pension
// before it goes and say what they feed it, the expense lines, so it
// can say when each loan's payments clear it, and the owners and the
// children, for the sections listing them; the read checks the session
// first, so the page renders behind the loading screen beside it and
// the rest of the shell
// does not wait for any of them. The plan is read beside them, for the
// month the ledger counts the salaries in, which is the month the plan
// starts in, and the rate the savings grow at, laid out as its own
// projection has it, so an owner already past the conditions they
// retire on earns no salary in that month, and the milestones it is
// laid out by that a house may move at, for the one it moves at. The header is the
// page's, as the plan screen's is, since it reads that month and what
// the balances come to and nothing else: it says the starting net worth
// and the month the balances are as of, the one before the plan starts
// in, at whose end they were read, as the assumptions screen's says the
// plan rate, and holds the month end, which moves the month on and
// checks the balances against it, closing onto the end of the last
// month that has ended unless another is picked, over the body the
// ledger lays its sections out in, which opens on how fresh the
// balances are, as the assumptions screen's opens on how fresh its
// sources are. The day and the month are read once on the server, and
// whether a scenario is open, since the month end is held while one is.
export default async function Accounts(): Promise<JSX.Element> {
  const [household, opened] = await Promise.all([getHousehold(), getOpened()]);
  const { accounts, owners } = household;
  const { plan, schedule } = laidOut(
    accounts,
    household.schedule,
    household.plan,
  );
  const day = today();
  return (
    <Screen
      actions={
        <MonthEnd
          accounts={accounts}
          isInScenario={opened !== null}
          month={monthBefore(thisMonth())}
          plan={plan}
          schedule={schedule}
          today={day}
        />
      }
      label={sectionLabel(accountsAndAssets)}
      meta={`Starting net worth ${formatGbp(balanceOf(accounts) - drawingTaxOf(accounts))} · balances as of the end of ${formatMonth(monthBefore({ month: plan.month, year: plan.from }))}`}
      title={accountsAndAssets.title}
    >
      <BalanceDates accounts={accounts} today={day} />
      <AccountLedger
        accounts={accounts}
        expenses={schedule.expenses}
        kids={household.children}
        lines={schedule.income}
        milestones={moveChoices(
          markersOf(household.milestones, plan),
          plan,
          accounts,
        )}
        owners={owners}
        plan={plan}
      />
    </Screen>
  );
}
