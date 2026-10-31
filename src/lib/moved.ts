import type { Account } from "@/data/accounts";
import type { Kept } from "@/data/household";
import type { Plan } from "@/data/plan";
import type { Future } from "@/engine/futures";
import type { MonthsOn } from "@/engine/projection";

import { soundKept } from "@/data/household";
import { ageIn, endAge } from "@/data/plan";
import { futureOf } from "@/engine/futures";
import { laidOut, monthsOn, project } from "@/engine/projection";
import { answerOf } from "@/lib/answer";
import { sumOf } from "@/lib/ledger";
import { monthsBetween } from "@/lib/months";

// What the household has moved by since the close before the latest:
// the age the liquid net worth is read at, the standing the month end
// expected, a step for each group that changed, or for two or more
// taken together, with the standing it leaves, and the standing now,
// which the last step leaves; the balances the close set; the sources
// and the records that changed; what the plan paid into the ISAs and
// the GIAs over the months closed; and how many months those were.
export interface Moved {
  readonly age: number;
  readonly balances: Balances;
  readonly changes: readonly Area[];
  readonly expected: Standing;
  readonly invested: number;
  readonly months: number;
  readonly now: Standing;
  readonly rates: readonly RateSource[];
  readonly steps: readonly Step[];
}

// A record outside the rates that the walk tells apart, for the step of
// changes to name.
type Area =
  | "accounts"
  | "ages"
  | "children"
  | "drawdown"
  | "milestones"
  | "owners"
  | "schedule";

// The balances the close set against those it closed from, over the
// accounts both hold, as the month end's ledger sums them: what they
// stood at, what the plan paid into the balances checked and what moved
// them besides, which add up to what they stand at now; what the month
// end expected them to stand at; and how many were left as they stood,
// their day unchanged.
interface Balances {
  readonly expected: number;
  readonly moved: number;
  readonly now: number;
  readonly paid: number;
  readonly stood: number;
  readonly unchecked: number;
}

// A group of what the household keeps, as the walk takes it: the
// balances, the rates and their sources, or everything else.
type Group = "balances" | "changes" | "rates";

// A source of the rates, as the walk tells them apart: the set chosen,
// the rates and the split typed, the CMA, the curve, the fees and the
// yield, the target allocation with its mappings, and the glide path.
type RateSource =
  "cma" | "curve" | "deductions" | "glide" | "rates" | "rateSet" | "targets";

// What the household reads at one state of the walk: the year the
// plan's owner retires in, or null where they never do, and the liquid
// net worth at the age the walk reads it at, whole pounds of today's
// money.
interface Standing {
  readonly liquid: number;
  readonly retired: null | number;
}

// The groups a step took, one or more, and the standing it leaves.
interface Step {
  readonly groups: readonly Group[];
  readonly standing: Standing;
}

// The records each area compares, an account by everything but its
// balance and the day it was set, which are the balances', in the order
// the accounts are listed, which moves the spare money.
const areas: readonly {
  readonly area: Area;
  readonly read: (kept: Kept) => unknown;
}[] = [
  {
    area: "accounts",
    read: ({ accounts }) =>
      accounts.map((account) => ({ ...account, balance: 0, setOn: null })),
  },
  { area: "owners", read: ({ owners }) => owners },
  { area: "children", read: ({ children }) => children ?? [] },
  { area: "schedule", read: ({ schedule }) => schedule },
  { area: "milestones", read: ({ milestones }) => milestones },
  { area: "ages", read: ({ ages }) => ages },
  { area: "drawdown", read: ({ drawdown }) => drawdown },
];

// The keys each source of the rates holds, in the order the
// assumptions screen lays them out: the rates tab, then the target
// allocation, then the glide path.
const sources: readonly {
  readonly keys: readonly (keyof Kept)[];
  readonly source: RateSource;
}[] = [
  { keys: ["rateSet"], source: "rateSet" },
  { keys: ["rates", "allocation"], source: "rates" },
  { keys: ["cma"], source: "cma" },
  { keys: ["curve"], source: "curve" },
  { keys: ["deductions"], source: "deductions" },
  { keys: ["targets", "mappings"], source: "targets" },
  { keys: ["glide"], source: "glide" },
];

// What moved the plan from the household as the close before the latest
// left it to the household now, both kept and sound. The walk opens on
// what the month end expected: the household then, moved on to the
// month the balances are as of now, each balance at what monthsOn
// carries it to over the months between, to the pound, as the month
// end's worksheet opens on. monthsOn is what the month end expects
// rather than the plan coming true: it draws nothing on the savings in
// a short month, settles no tax year in April and moves no house, so
// what those would have done shows as the balances' move. The kept
// accounts are carried rather than the laid-out ones, which differ only
// in the year a move falls in, which no month end reads. From there the
// walk swaps in what the household holds now a group at a time: the
// balances of the accounts both hold, then the rates and their sources,
// then everything else, which leaves the household now. Each state is
// read for when the plan's owner retires and its liquid net worth at an
// age held fixed, the one they retire at as the month end expected, or
// the one the plan runs to where they never do, so a year moved does
// not move where the worth is read. A group that changed nothing is
// skipped, and one leaving a state the rules refuse is taken together
// with the groups after it until the state is sound, the step naming
// each of them that changed something, so the steps always end on the
// household now: the last group is taken to carry a refused one there
// even where it changed nothing itself, and is then not named. Each step is
// worked out after the ones before it, so taken in another order a
// group's share of the move could differ. Refused in the rules' words
// where even the expected state is.
export function movedSince(before: Kept, now: Kept): Moved {
  const then = soundKept(before).household;
  const { plan, schedule } = laidOut(then.accounts, then.schedule, then.plan);
  const months = Math.max(0, monthsBetween(before.asOf, now.asOf));
  const carried = monthsOn(before.accounts, schedule, { months, plan });
  const expected: Kept = {
    ...before,
    accounts: carried.map(({ account, balance }) => ({
      ...account,
      balance: Math.round(balance),
    })),
    asOf: now.asOf,
  };
  const opening = futureIn(expected);
  const { retired } = opening.future;
  const age =
    retired === null ? endAge(opening.plan) : ageIn(retired, opening.plan);
  const nowById = new Map(now.accounts.map((account) => [account.id, account]));
  const closed = (accounts: readonly Account[]): readonly Account[] =>
    accounts.map((account) => ({
      ...account,
      balance: nowById.get(account.id)?.balance ?? account.balance,
    }));
  const rates = sources
    .filter(({ keys }) => keys.some((key) => differs(before[key], now[key])))
    .map(({ source }) => source);
  const changes = areas
    .filter(({ read }) => differs(read(before), read(now)))
    .map(({ area }) => area);
  const walk: readonly {
    readonly group: Group;
    readonly isChanged: boolean;
    readonly take: (kept: Kept) => Kept;
  }[] = [
    {
      group: "balances",
      isChanged: differs(closed(expected.accounts), expected.accounts),
      take: (kept) => ({ ...kept, accounts: closed(kept.accounts) }),
    },
    {
      group: "rates",
      isChanged: rates.length > 0,
      take: (kept) => ({
        ...kept,
        ...Object.fromEntries(
          sources.flatMap(({ keys }) => keys.map((key) => [key, now[key]])),
        ),
      }),
    },
    { group: "changes", isChanged: changes.length > 0, take: () => now },
  ];
  const standing = standingAt(opening.future, age);
  const steps: Step[] = [];
  let pending: Group[] = [];
  let state = expected;
  for (const { group, isChanged, take } of walk) {
    if (isChanged || (group === "changes" && pending.length > 0)) {
      state = take(state);
      pending = isChanged ? [...pending, group] : pending;
      const read = answerOf(() => standingAt(futureIn(state).future, age));
      if (read.kind === "saved") {
        steps.push({ groups: pending, standing: read.value });
        pending = [];
      }
    }
  }
  return {
    age,
    balances: balancesOf(carried, nowById),
    changes,
    expected: standing,
    invested: Math.round(
      sumOf(
        carried.filter(({ account }) =>
          ["tax-free", "taxable"].includes(account.kind),
        ),
        ({ paid }) => paid,
      ),
    ),
    months,
    now: steps.at(-1)?.standing ?? standing,
    rates,
    steps,
  };
}

// The balances the close set against those it closed from, over the
// accounts both hold: one whose day moved was checked, and was paid what
// the plan carried into it, the rest of its difference having moved it;
// one whose day did not was left as it stood.
function balancesOf(
  carried: readonly MonthsOn[],
  now: ReadonlyMap<number, Account>,
): Balances {
  const both = carried.flatMap((reached) => {
    const closed = now.get(reached.account.id);
    return closed === undefined ? [] : [{ ...reached, closed }];
  });
  const checked = both.filter(
    ({ account, closed }) => closed.setOn !== account.setOn,
  );
  const stood = sumOf(both, ({ account }) => account.balance);
  const paid = Math.round(sumOf(checked, (reached) => reached.paid));
  const total = sumOf(both, ({ closed }) => closed.balance);
  return {
    expected: sumOf(both, ({ balance }) => Math.round(balance)),
    moved: total - stood - paid,
    now: total,
    paid,
    stood,
    unchecked: both.length - checked.length,
  };
}

// Whether two kept values differ, as the store would write them.
function differs(one: unknown, other: unknown): boolean {
  return JSON.stringify(one) !== JSON.stringify(other);
}

// A kept household's own projection read as a future, with the plan it
// was run over.
function futureIn(kept: Kept): {
  readonly future: Future;
  readonly plan: Plan;
} {
  const { accounts, plan, schedule } = soundKept(kept).household;
  return {
    future: futureOf(project(accounts, schedule, plan), {
      accounts,
      plan,
      schedule,
    }),
    plan,
  };
}

// What a future stands at: when its owner retires, and its liquid net
// worth in the first year at or after the age given, or in its last
// where it ends first. A projection always holds a year, so the years
// are folded down to the one found rather than searched.
function standingAt(future: Future, age: number): Standing {
  const year = future.measured.reduce((found, measured) =>
    found.age >= age ? found : measured,
  );
  return { liquid: year.liquid, retired: future.retired };
}
