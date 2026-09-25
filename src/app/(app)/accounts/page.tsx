import type { JSX } from "react";

import { AccountLedger } from "@/components/app/organisms/account-ledger";
import {
  getAccounts,
  getIncomeLines,
  getOwners,
  getPlan,
} from "@/store/household";

// The reference's plan screen opened on its accounts tab, with that tab
// split in two: the wrappers, cash and the loans on one, the real assets on the
// other. The page reads the accounts from the store, and the income
// lines with them, so the ledger can name the salaries feeding a
// pension before it goes and say what they feed it, and the owners, for
// the section listing them; each read checks the session first, so the
// page renders behind the loading screen beside it and the rest of the
// shell does not wait for any of them. The
// plan is read beside them, for the month the ledger counts the
// salaries in, which is the month the balances are as of.
export default async function Accounts(): Promise<JSX.Element> {
  const [accounts, lines, owners, { from, month }] = await Promise.all([
    getAccounts(),
    getIncomeLines(),
    getOwners(),
    getPlan(),
  ]);
  return (
    <AccountLedger
      accounts={accounts}
      at={{ month, year: from }}
      lines={lines}
      owners={owners}
    />
  );
}
