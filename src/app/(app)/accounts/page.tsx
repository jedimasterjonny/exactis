import type { Metadata } from "next";
import type { JSX } from "react";

import { CalendarCheck } from "lucide-react";
import Link from "next/link";

import { BalanceDates } from "@/components/app/atoms/balance-dates";
import { Screen } from "@/components/app/templates/screen";
import { buttonVariants } from "@/components/kit/button";
import { moveChoices } from "@/data/houses";
import { markersOf } from "@/data/milestones";
import { laidOut } from "@/engine/projection";
import { balanceOf, drawingTaxOf, giaTaxOf } from "@/lib/ledger";
import { formatGbp } from "@/lib/money";
import { formatMonth, monthBefore, today } from "@/lib/months";
import { accountsAndAssets, monthEnd, sectionLabel } from "@/lib/nav";
import { getHousehold } from "@/store/household";

import { AccountLedger } from "./account-ledger";

export const metadata: Metadata = { title: accountsAndAssets.label };

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
// page's, as the plan screen's is, since it reads that month: it says
// the month the balances are as of, the one before the plan starts in,
// at whose end they were read, and links to the month end, which moves
// the month on and checks the balances against it. The body opens on a
// sentence saying the net worth the plan starts from, what the balances
// come to once pensions are counted at what drawing them would leave and
// GIAs after estimated unrealised CGT, which is the balance sheet's own
// total and what the plan's
// first year opens on, as the other screens open on their answers; with
// no account there is no sentence, since the sheet's empty state says
// it. No-break spaces bind "a net worth", so no line breaks inside it.
// Beneath the sentence the strip says how fresh the balances are, as
// the assumptions screen's says how fresh its sources are, over the
// sections the ledger lays out. The day is read once on the server.
export default async function Accounts(): Promise<JSX.Element> {
  const household = await getHousehold();
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
        <Link className={buttonVariants({ size: "sm" })} href={monthEnd.href}>
          <CalendarCheck aria-hidden />
          Update balances
        </Link>
      }
      label={sectionLabel(accountsAndAssets)}
      meta={`Balances as of the end of ${formatMonth(monthBefore({ month: plan.month, year: plan.from }))}`}
      title={accountsAndAssets.title}
    >
      {accounts.length > 0 && (
        <h2 className="heading text-2xl text-balance tabular-nums">
          {`The plan starts from a\u00a0net\u00a0worth of ${formatGbp(balanceOf(accounts) - drawingTaxOf(accounts) - giaTaxOf(accounts))}.`}
        </h2>
      )}
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
