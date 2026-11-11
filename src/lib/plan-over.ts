import * as z from "zod";

import type { Account } from "@/data/accounts";
import type { Deductions } from "@/data/cma";
import type { Kept } from "@/data/household";

import { deductedBy } from "@/data/moves";
import { recordId } from "@/data/schemas";
import { upcast } from "@/data/shapes";
import { Refusal } from "@/lib/answer";

// The copy a scenario was made from, its first version, read for the
// ids of its accounts and nothing else: the copy was sound when it was
// kept, and a rule tightened since would otherwise refuse an adoption it
// has no part in.
const fork = z.object({ accounts: z.array(z.object({ id: recordId })) });

// The ids of the accounts in the copy a scenario was made from, carried
// through the chain and read as fork reads them, an account listed
// twice once.
export function forkOf(copy: unknown): ReadonlySet<number> {
  return new Set(fork.parse(upcast(copy)).accounts.map(({ id }) => id));
}

// The household a scenario leaves when it is adopted: the scenario's
// plan over the household's bookkeeping. The bookkeeping is what was
// recorded of the household rather than planned for it: each account's
// balance and the day it was set, the month the balances are as of, the
// progress points, what was pulled from outside, the house price index,
// the CMA and the inflation curve, and the holdings last imported from
// Portfolio Performance, the newer of the two imports, with the day,
// the cash and what was paid in. The rest is the plan, and the
// scenario's: the owners, the children, the accounts and what pays into
// them, the milestones, both schedules, the ages, the rates typed and
// which set is live, the drawdown, the split, the glide path, the
// deductions, the target allocation's shares and its mappings, and the
// next record's id. Where the scenario's import is the newer, its
// target allocation is taken whole; where it is no newer, the
// household's import is kept under the scenario's shares, laid over it
// by category in the scenario's order, a category only the household's
// lists following at the 0% it asks, and one only the scenario's lists
// dropped, since the household's file no longer holds it. A category
// only one lists that asks more than 0% is refused, since the shares
// would then not add up to the whole, so the operator imports into the
// scenario first. A scenario holding no target allocation leaves the
// household's whole, its mappings among it, and a category only the
// household's import lists keeps the household's mapping where the
// scenario holds none for it, since a scenario holds no plan for a
// category it never listed. The deductions are the household's, with
// the day they were set, where the scenario's fees and yield read the
// same, dated no later, and the scenario's otherwise. Balances go by
// the account's id: an account in both takes the household's balance,
// one only the scenario holds keeps its own, and one only the household
// holds is gone, since the scenario deleted it. That holds only for an
// account the scenario's own first version held, whose ids are handed
// in as forked: one the household holds that it did not would be gone
// unsaid, or read as the scenario's own under the same id, its balance
// laid over that one. So a household holding an account whose id is not
// among them is refused. The merged household gives its next
// record the higher of the two ids, since an id only ever counts up and
// each branch's next stands where its own additions moved it, an
// account since taken out among them.
export function planOver(
  household: Kept,
  scenario: Kept,
  forked: ReadonlySet<number>,
): Kept {
  if (household.accounts.some(({ id }) => !forked.has(id))) {
    throw new Refusal(
      "The household holds an account that was not in this scenario when it was made, so the scenario cannot be laid over the household; delete the account from the household first, and add it again after if it is still wanted; if this scenario holds it now, redo its changes in a new scenario made from the household instead",
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
    deductions: deductionsOver(household, scenario),
    housePrices: household.housePrices,
    next: Math.max(household.next, scenario.next),
    points: household.points,
    ...targetsOver(household, scenario),
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

// The fees and yield the scenario leaves, as planOver says: the
// household's, with their day, where the scenario's read the same and
// are dated no later, an undated one earliest of all.
function deductionsOver(household: Kept, scenario: Kept): Deductions {
  return JSON.stringify(deductedBy(household)) ===
    JSON.stringify(deductedBy(scenario)) &&
    (scenario.deductions.setOn ?? "") <= (household.deductions.setOn ?? "")
    ? household.deductions
    : scenario.deductions;
}

// The target allocation and the mappings the scenario leaves, as
// planOver says.
function targetsOver(
  { mappings, targets: held }: Kept,
  scenario: Kept,
): Pick<Kept, "mappings" | "targets"> {
  const { targets } = scenario;
  if (targets === null) {
    return { mappings, targets: held };
  }
  if (held === null || targets.importedOn > held.importedOn) {
    return { mappings: scenario.mappings, targets };
  }
  const theirs = new Map(
    held.categories.map((category) => [category.id, category]),
  );
  const ours = new Set(targets.categories.map(({ id }) => id));
  if (
    targets.categories.some(({ id, share }) => share > 0 && !theirs.has(id)) ||
    held.categories.some(({ id, share }) => share > 0 && !ours.has(id))
  ) {
    throw new Refusal(
      "The household's last import and the scenario's do not list the same categories with a target above 0%, so the scenario's targets cannot be laid over the household's; import from Portfolio Performance in the scenario first, then retarget it again if it was retargeted",
    );
  }
  const mapped = new Set(scenario.mappings.map(({ category }) => category));
  return {
    mappings: [
      ...scenario.mappings,
      ...mappings.filter(
        ({ category }) =>
          theirs.has(category) && !ours.has(category) && !mapped.has(category),
      ),
    ],
    targets: {
      ...held,
      categories: [
        ...targets.categories.flatMap(({ id, share }) => {
          const category = theirs.get(id);
          return category === undefined ? [] : [{ ...category, share }];
        }),
        ...held.categories.filter(({ id }) => !ours.has(id)),
      ],
    },
  };
}
