import type { JSX } from "react";

import { ScreenBody } from "@/components/app/atoms/screen-body";
import { ScreenHeader } from "@/components/app/atoms/screen-header";
import { AccountLedger } from "@/components/app/organisms/account-ledger";
import { BalancesMonth } from "@/components/app/organisms/balances-month";
import { monthName } from "@/lib/months";
import { accountsAndAssets, sectionLabel } from "@/lib/nav";
import { getHousehold } from "@/store/household";

// The reference's plan screen opened on its accounts tab, with that tab
// split in two: the wrappers, cash and the loans on one, the real assets on the
// other. The page reads the accounts from the store, and the income
// lines with them, so the ledger can name the salaries feeding a
// pension before it goes and say what they feed it, and the owners, for
// the section listing them; the read checks the session first, so the
// page renders behind the loading screen beside it and the rest of the
// shell does not wait for any of them. The
// plan is read beside them, for the month the ledger counts the
// salaries in, which is the month the balances are as of. The header
// is the page's, as the plan screen's is, since it reads that month and
// nothing else: it says which month it is and holds the button that
// moves it, over the body the ledger lays its sections out in.
export default async function Accounts(): Promise<JSX.Element> {
  const {
    accounts,
    owners,
    plan: { from, month },
    schedule,
  } = await getHousehold();
  const at = { month, year: from };
  return (
    <>
      <ScreenHeader
        actions={<BalancesMonth at={at} />}
        label={sectionLabel(accountsAndAssets)}
        title={accountsAndAssets.title}
      >
        {`Starting balances for the plan · ${monthName(month, "long")} ${String(from)}`}
      </ScreenHeader>
      <ScreenBody>
        <AccountLedger
          accounts={accounts}
          at={at}
          lines={schedule.income}
          owners={owners}
        />
      </ScreenBody>
    </>
  );
}
