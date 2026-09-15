import type { JSX } from "react";

import { AccountLedger } from "@/components/account-ledger";
import { accounts } from "@/data/accounts";

// The reference's plan screen opened on its accounts tab, with that tab
// split in two: the wrappers and cash on one, the real assets and the loans
// against them on the other. The ledger holds the rows and the entry, and
// the page hands it the reference kit's invented plan, standing in until
// there is a store to read from.
export default function Accounts(): JSX.Element {
  return <AccountLedger accounts={accounts} />;
}
