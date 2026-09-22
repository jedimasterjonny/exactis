import type { JSX } from "react";

import { AccountLedger } from "@/components/app/organisms/account-ledger";
import { getAccounts } from "@/store/accounts";
import { getPlan } from "@/store/plan";
import { getIncomeLines } from "@/store/schedule";

// The reference's plan screen opened on its accounts tab, with that tab
// split in two: the wrappers, cash and the loans on one, the real assets on the
// other. The page reads the accounts from the store, and the income
// lines with them, so the ledger can name the salaries feeding a
// pension before it goes and say what they feed it; each read checks
// the session first, so the page renders behind the loading screen
// beside it and the rest of the shell does not wait for either. The
// plan is read after them, as the plan page reads it, for the month
// the ledger counts the salaries in: the reads behind the session make
// the route dynamic, and the month has to be read at request time.
export default async function Accounts(): Promise<JSX.Element> {
  const [accounts, lines] = await Promise.all([
    getAccounts(),
    getIncomeLines(),
  ]);
  const { from, month } = getPlan();
  return (
    <AccountLedger
      accounts={accounts}
      at={{ month, year: from }}
      lines={lines}
    />
  );
}
