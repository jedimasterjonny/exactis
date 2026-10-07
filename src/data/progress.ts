import type { Month } from "@/data/schedule";

// A progress point is the household's balances as they were read at the
// end of a month, summed as the sheet they are read off sums them: the
// pensions, the ISAs, what the property and vehicles were worth, the
// loans secured on them and the debt secured on nothing, each whole
// pounds, the two debts nothing or less as an account's is. Cash is
// left out, as the sheet leaves it out, and a point carries no account
// of its own, since the accounts a balance was summed over have come
// and gone over the years the points span where the sums have not.
export interface ProgressPoint {
  readonly assets: number;
  readonly deferred: number;
  readonly free: number;
  readonly loans: number;
  readonly month: Month;
  readonly unsecured: number;
}
