import type { Account, AccountValues } from "@/data/accounts";
import type { ExpenseLineValues } from "@/data/expenses";

// An asset and the loan secured on it, as the store holds them: two
// accounts the loan links, or the asset alone when it is owned
// outright. A house and a car are the same shape here, which is why
// this is one type and not one per asset: the names differed, the
// members never did, so nothing was ever kept from standing for
// anything else.
export interface Secured {
  readonly asset: Account;
  readonly loan: Account | null;
}

// What an asset's model lays out to be written together: the asset,
// and the loan secured on it with its payments, or none for an asset
// owned outright.
export interface SecuredRecords {
  readonly asset: AccountValues;
  readonly loan: Borrowing | null;
}

// A loan secured on an asset and the line of its payments: the loan
// carries what is owed and the rate it is charged at, the line what is
// paid and until when. The store holds them apart and every asset's
// model writes them together, so they travel as one.
interface Borrowing {
  readonly account: AccountValues;
  readonly line: ExpenseLineValues;
}
