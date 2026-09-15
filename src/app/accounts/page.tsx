import type { JSX } from "react";

import { AccountLedger } from "@/components/account-ledger";

import { getAccounts } from "./store";

// The reference's plan screen opened on its accounts tab, with that tab
// split in two: the wrappers and cash on one, the real assets and the loans
// against them on the other. The page reads the accounts from the store,
// which reads the session first, so it renders behind the loading screen
// beside it and the rest of the shell does not wait for either.
export default async function Accounts(): Promise<JSX.Element> {
  return <AccountLedger accounts={await getAccounts()} />;
}
