import type { JSX } from "react";

import { AccountLedger } from "@/components/app/organisms/account-ledger";

import { getIncomeLines } from "../plan/store";
import { getAccounts } from "./store";

// The reference's plan screen opened on its accounts tab, with that tab
// split in two: the wrappers, cash and the loans on one, the real assets on the
// other. The page reads the accounts from the store, and the income
// lines with them, so the ledger can name the salaries feeding a
// pension before it goes; each read checks the session first, so the
// page renders behind the loading screen beside it and the rest of the
// shell does not wait for either.
export default async function Accounts(): Promise<JSX.Element> {
  const [accounts, lines] = await Promise.all([
    getAccounts(),
    getIncomeLines(),
  ]);
  return <AccountLedger accounts={accounts} lines={lines} />;
}
