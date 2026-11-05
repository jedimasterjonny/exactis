import * as z from "zod";

import type { Account } from "@/data/accounts";
import type { Kept } from "@/data/household";

import { recordId } from "@/data/schemas";
import { Refusal } from "@/lib/answer";

// The id the next record is given, read off the copy a scenario was made
// from and nothing else: the copy was sound when it was kept, and a rule
// tightened since would otherwise refuse an adoption it has no part in.
export const fork = z.object({ next: recordId });

// The household a scenario leaves when it is adopted: the scenario's
// plan over the household's bookkeeping. The bookkeeping is what was
// recorded of the household rather than planned for it: each account's
// balance and the day it was set, the month the balances are as of, the
// progress points, and what was pulled from outside, the house price
// index, the CMA and the inflation curve. The rest is the plan, and the
// scenario's: the owners, the children, the accounts and what pays
// into them, the milestones, both schedules, the ages, the rates typed
// and which set is live, the drawdown, the split, the glide path, the deductions, the target
// allocation and its mappings, and the next record's id. Balances go by
// the account's id: an account in both takes the household's balance,
// one only the scenario holds keeps its own, and one only the household
// holds is gone, since the scenario deleted it. That holds only while
// the household holds no account added since the scenario was made:
// each branch gives its next record the id the household's next stood
// at when the scenario was made, so an account added to each would be
// read as one, the scenario's taking the household's balance and the
// household's gone unsaid, and one added to the household alone would
// go unsaid too. A household holding an account with an id from that
// one on is refused, so the operator takes the account out of the
// household and puts it back after. The merged household gives its next
// record the higher of the two ids, since an id only ever counts up and
// each branch's next stands where its own additions moved it, an
// account since taken out among them.
export function planOver(
  household: Kept,
  scenario: Kept,
  forkedAt: number,
): Kept {
  if (household.accounts.some(({ id }) => id >= forkedAt)) {
    throw new Refusal(
      "An account was added to the household since this scenario was made, so the scenario cannot be laid over it; delete it from the household first, and add it again after",
    );
  }
  return {
    ...scenario,
    accounts: scenario.accounts.map((account) => {
      const kept = household.accounts.find(({ id }) => id === account.id);
      return kept === undefined ? account : balancedAs(account, kept);
    }),
    asOf: household.asOf,
    cma: household.cma,
    curve: household.curve,
    housePrices: household.housePrices,
    next: Math.max(household.next, scenario.next),
    points: household.points,
  };
}

// An account of the scenario's, with the balance the household holds
// for it and the day that balance was set, where it was dated; one the
// household holds undated keeps the scenario's day, as a save leaves an
// undated balance's day as it was.
function balancedAs(account: Account, kept: Account): Account {
  return {
    ...account,
    balance: kept.balance,
    ...(kept.setOn !== undefined && { setOn: kept.setOn }),
  };
}
