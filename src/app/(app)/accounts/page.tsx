import type { JSX } from "react";

import { AccountLedger } from "@/components/app/organisms/account-ledger";

import { getAccounts } from "./store";

// The reference's plan screen opened on its accounts tab, with that tab
// split in two: the wrappers, cash and the loans on one, the real assets on the
// other. The page reads the accounts from the store,
// which reads the session first, so it renders behind the loading screen
// beside it and the rest of the shell does not wait for either.
export default async function Accounts(): Promise<JSX.Element> {
  return <AccountLedger accounts={await getAccounts()} />;
}
