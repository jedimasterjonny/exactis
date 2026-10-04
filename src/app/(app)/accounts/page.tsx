import type { JSX } from "react";

import { BalanceDates } from "@/components/app/atoms/balance-dates";
import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { AccountLedger } from "@/components/app/organisms/account-ledger";
import { MonthEnd } from "@/components/app/organisms/month-end";
import { balanceOf } from "@/lib/ledger";
import { formatGbp } from "@/lib/money";
import { formatMonth, thisMonth, today } from "@/lib/months";
import { accountsAndAssets, sectionLabel } from "@/lib/nav";
import { getHousehold } from "@/store/household";

// The reference's plan screen opened on its accounts tab, with that tab
// split in two: the wrappers, cash and the loans on one, the real assets on the
// other. The page reads the accounts from the store, the income lines
// with them, so the ledger can name the salaries feeding a pension
// before it goes and say what they feed it, the expense lines, so it
// can say when each loan's payments clear it, and the owners, for the
// section listing them; the read checks the session first, so the page
// renders behind the loading screen beside it and the rest of the shell
// does not wait for any of them. The plan is read beside them, for the
// month the ledger counts the salaries in, which is the month the
// balances are as of, and the rate the savings grow at. The header is
// the page's, as the plan screen's is, since it reads that month and
// what the balances come to and nothing else: it says the starting net
// worth and the month, as the assumptions screen's says the plan rate,
// and holds the month end, which moves the month on and checks the
// balances against it, closing onto the month it is unless another is
// picked, over the body the ledger lays its sections out in, which
// opens on how fresh the balances are, as the assumptions screen's
// opens on how fresh its sources are. The day and the month are read
// once on the server.
export default async function Accounts(): Promise<JSX.Element> {
  const { accounts, owners, plan, schedule } = await getHousehold();
  const day = today();
  return (
    <>
      <ScreenHeader
        actions={
          <MonthEnd
            accounts={accounts}
            month={thisMonth()}
            plan={plan}
            schedule={schedule}
            today={day}
          />
        }
        label={sectionLabel(accountsAndAssets)}
        title={accountsAndAssets.title}
      >
        {`Starting net worth ${formatGbp(balanceOf(accounts))} · balances as of ${formatMonth({ month: plan.month, year: plan.from })}`}
      </ScreenHeader>
      <ScreenBody>
        <BalanceDates accounts={accounts} today={day} />
        <AccountLedger
          accounts={accounts}
          expenses={schedule.expenses}
          lines={schedule.income}
          owners={owners}
          plan={plan}
        />
      </ScreenBody>
    </>
  );
}
