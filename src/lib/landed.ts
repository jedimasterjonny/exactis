import type { Account } from "@/data/accounts";
import type { Household, Kept } from "@/data/household";
import type { Spread } from "@/data/plan";
import type { Month } from "@/data/schedule";
import type { Bands } from "@/engine/futures";
import type { Answer } from "@/lib/answer";

import { cashFlow } from "@/engine/cash-flow";
import { bandsOf, monthsAlong, runLength } from "@/engine/futures";
import { isOnPlanRate, laidOut, monthsOn } from "@/engine/projection";
import { sumOf } from "@/lib/ledger";
import { cutOf, monthsBetween } from "@/lib/months";
import { paidIn } from "@/lib/moved";

// A close kept in the year before the latest, as the store reads one:
// the month its balances were as of, and the household it kept, as kept
// and as it makes it, held to the rules, or why that cannot be read
// whole.
export interface KeptClose {
  readonly before: Answer<{
    readonly household: Household;
    readonly kept: Kept;
  }>;
  readonly month: Month;
}

// Where the invested balances landed among the futures of a close: what
// they stand at now, the month that close's balances were as of and how
// many months on from it now is, the bands its run of futures carries
// them to, each shifted by what was paid in beyond what its plan paid,
// as Portfolio Performance says, and that shift; the names of the
// accounts it said that of; how many accounts were read, and how many
// on the plan rate in that close were left out; and whether the plan at
// its own rates leaves any of the months short.
export interface Landed {
  readonly actual: number;
  readonly asOf: Month;
  readonly bands: Bands;
  readonly beyond: number;
  readonly isDrawing: boolean;
  readonly left: number;
  readonly months: number;
  readonly paidBy: readonly string[];
  readonly read: number;
}

// Where the invested balances landed among the futures of the oldest
// close that can give a reading, or null where none can, with each
// older close passed over on the way.
export interface Landing {
  readonly landed: Landed | null;
  readonly passed: readonly Passed[];
}

// A close passed over, by the month its balances were as of, and why:
// it cannot be read whole, its plan has no spread to draw futures from,
// or no invested balance was checked at both it and the latest.
export interface Passed {
  readonly kind: "short" | "unchecked" | "unreadable";
  readonly month: Month;
}

// What a reading of a close works from: the accounts it kept and the
// month their balances were as of, the household it makes, the
// accounts read at both it and now, by id as now holds them, how many
// of its invested accounts were not, and how many months on now is.
interface Laid {
  readonly accounts: readonly Account[];
  readonly asOf: Month;
  readonly household: Household;
  readonly left: number;
  readonly months: number;
  readonly read: ReadonlyMap<number, Account>;
}

// Where the invested balances landed since the oldest of the closes
// given, oldest first, that gives a reading, beside the household now.
// The invested balances are the accounts a close holds on the plan rate,
// no debt among them, that the household now still holds by id, each
// checked at both closes: set on or after the cut of that close's month,
// and of now's. A close is passed over where it cannot be read whole,
// where its plan has no spread, or where no invested balance was checked
// at both, each found before any future is drawn, and the futures are
// drawn for the close picked alone. Its plan is laid out as movedSince
// lays it, and its run of futures is the chance's, carried as many months
// on as the close is before now by monthsAlong; each future sums the
// invested balances, and the bands are read off the sums by bandsOf, each
// shifted by what Portfolio Performance says was paid into those accounts
// since that close beyond what the plan at its own rates paid them, where
// it names them. A month is short where its cash flow over the accounts
// that close kept, with no pension kept paid out of the savings, leaves
// less than nothing, which is the spending monthsOn counts as unmet
// rather than draws. A close one to twelve months before now is read, and
// any other fails.
export function landedSince(closes: readonly KeptClose[], now: Kept): Landing {
  const passed: Passed[] = [];
  for (const { before, month } of closes) {
    if (before.kind === "refused") {
      passed.push({ kind: "unreadable", month });
    } else {
      const laid = laidFrom(before.value, now);
      if ("short" in laid.household.spread) {
        passed.push({ kind: "short", month });
      } else if (laid.read.size === 0) {
        passed.push({ kind: "unchecked", month });
      } else {
        return { landed: landedOver(laid, laid.household.spread, now), passed };
      }
    }
  }
  return { landed: null, passed };
}

// Whether a balance was checked at a close of the month given: set on
// or after its cut.
function isCheckedAt({ setOn }: Account, month: Month): boolean {
  return setOn !== undefined && setOn >= cutOf(month);
}

// What a reading of a close works from, as a close one to twelve
// months before now gives it.
function laidFrom(
  {
    household,
    kept: before,
  }: { readonly household: Household; readonly kept: Kept },
  now: Kept,
): Laid {
  const months = monthsBetween(before.asOf, now.asOf);
  if (months < 1 || months > 12) {
    throw new Error("A close is read from one to twelve months back");
  }
  const held = new Map(now.accounts.map((account) => [account.id, account]));
  const invested = before.accounts.filter(isOnPlanRate);
  const read = new Map(
    invested.flatMap((account) => {
      const closed = held.get(account.id);
      return closed !== undefined &&
        isCheckedAt(account, before.asOf) &&
        isCheckedAt(closed, now.asOf)
        ? [[account.id, closed] as const]
        : [];
    }),
  );
  return {
    accounts: before.accounts,
    asOf: before.asOf,
    household,
    left: invested.length - read.size,
    months,
    read,
  };
}

// Where the invested balances landed among the futures a close's plan,
// laid out, draws at the spread given.
function landedOver(
  { accounts, asOf, household, left, months, read }: Laid,
  spread: Spread,
  now: Kept,
): Landed {
  const { plan, schedule } = laidOut(
    household.accounts,
    household.schedule,
    household.plan,
  );
  const actual = paidIn(now, asOf);
  const paidBy = monthsOn(accounts, schedule, { months, plan }).flatMap(
    ({ account, paid }) => {
      const closed = read.get(account.id);
      if (closed === undefined) {
        return [];
      }
      const said = actual.get(closed.name);
      return said === undefined ? [] : [{ beyond: said - paid, ...closed }];
    },
  );
  const beyond = sumOf(paidBy, (each) => each.beyond);
  return {
    actual: sumOf([...read.values()], ({ balance }) => balance),
    asOf,
    bands: bandsOf(
      monthsAlong(accounts, schedule, { months, plan, spread })
        .take(runLength)
        .map(
          (reached) =>
            beyond +
            sumOf(reached, ({ account, balance }) =>
              read.has(account.id) ? balance : 0,
            ),
        )
        .toArray(),
    ),
    beyond,
    isDrawing: Array.from({ length: months }, (_, offset) => {
      const month = plan.month + offset;
      return { month: month % 12, year: plan.from + Math.floor(month / 12) };
    }).some(
      (at) => cashFlow(accounts, schedule, { at, plan, reserve: 0 }).left < 0,
    ),
    left,
    months,
    paidBy: paidBy.map(({ name }) => name),
    read: read.size,
  };
}
