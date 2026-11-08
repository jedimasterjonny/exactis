import type { Account } from "@/data/accounts";
import type { Kept, KeptBalances } from "@/data/household";
import type { Plan } from "@/data/plan";
import type { KeptPoint } from "@/data/progress";
import type { Month } from "@/data/schedule";
import type { Future } from "@/engine/futures";
import type { MonthsOn } from "@/engine/projection";

import { soundKept } from "@/data/household";
import { blendedBy, deductedBy } from "@/data/moves";
import { ageIn, endAge } from "@/data/plan";
import { endWorthOf, futureOf } from "@/engine/futures";
import { laidOut, monthsOn, project } from "@/engine/projection";
import { answerOf } from "@/lib/answer";
import { sumOf } from "@/lib/ledger";
import { cutOf, monthsBetween } from "@/lib/months";

// A record outside the rates that the walk tells apart, for the step of
// changes to name.
export type Area =
  | "accounts"
  | "ages"
  | "children"
  | "drawdown"
  | "milestones"
  | "owners"
  | "schedule";

// A group of what the household keeps, as the walk takes it: the
// balances, the rates and their sources, or everything else.
export type Group = "balances" | "changes" | "rates";

// A line of what making a scenario the household would change: a record
// of the plan, told by what it is and its id, or a setting of it, named
// as a screen names it, with whether only the scenario holds it, both
// hold it but apart, or only the household holds it.
export interface Line {
  readonly change: "added" | "changed" | "removed";
  readonly key: string;
  readonly label: string;
}

// What the household has moved by since the close before the latest:
// the age the liquid net worth is read at, the standing the month end
// expected, a step for each group that changed, or for two or more
// taken together, with the standing it leaves, and the standing now,
// which the last step leaves; the balances the close set; the sources
// that changed what could move a rate, and the records that changed;
// what the plan paid into the ISAs and
// the GIAs over the months closed; how many months those were; and the
// age the liquid net worth is held at, which is the one it is read at
// but where the plan now ends before it.
export interface Moved {
  readonly age: number;
  readonly balances: Balances;
  readonly changes: readonly Area[];
  readonly expected: Standing;
  readonly fixed: number;
  readonly invested: number;
  readonly months: number;
  readonly now: Standing;
  readonly rates: readonly RateSource[];
  readonly steps: readonly Step[];
}

// A source of the rates, as the walk tells them apart: the set chosen,
// the rates and the split typed, the CMA, the curve, the fees and the
// yield, the target allocation with its mappings, and the glide path.
export type RateSource =
  "cma" | "curve" | "deductions" | "glide" | "rates" | "rateSet" | "targets";

// What a plan comes to at its own rates, as the dashboard reads it: the
// age it runs to, the age its owner retires at, or null where they never
// do by its end, and the net worth it holds entering its last year, in
// whole pounds of today's money.
export interface Side {
  readonly ends: number;
  readonly retires: null | number;
  readonly worth: number;
}

// What the household reads at one state of the walk: the year the
// plan's owner retires in, or null where they never do, and the liquid
// net worth at the age the walk reads it at, whole pounds of today's
// money.
export interface Standing {
  readonly liquid: number;
  readonly retired: null | number;
}

// The balances the close set against those it closed from, over the
// accounts both hold, as the month end's ledger sums them: what they
// stood at, what was paid into the balances checked and what moved them
// besides, which add up to what they stand at now; what the plan paid
// into the balances checked; the names of those whose paid in is what
// Portfolio Performance says was, rather than the plan's; what the
// month end expected them to stand at; and how many were left as they
// stood, their day unchanged.
interface Balances {
  readonly actual: readonly string[];
  readonly expected: number;
  readonly moved: number;
  readonly now: number;
  readonly paid: number;
  readonly planned: number;
  readonly stood: number;
  readonly unchecked: number;
}

// The groups a step took, one or more, and the standing it leaves.
interface Step {
  readonly groups: readonly Group[];
  readonly standing: Standing;
}

// What each record outside the rates is called, as its screen names it.
export const areaNames: Record<Area, string> = {
  accounts: "Accounts",
  ages: "Plan end age",
  children: "Children",
  drawdown: "Drawdown",
  milestones: "Milestones",
  owners: "Owners",
  schedule: "Income & expenses",
};

// What each source of the rates is called, as the assumptions screen
// names it.
export const sourceNames: Record<RateSource, string> = {
  cma: "BlackRock CMA",
  curve: "BoE curve",
  deductions: "Fees and yield",
  glide: "Glide path",
  rates: "Rates typed",
  rateSet: "Set of rates",
  targets: "Target allocation",
};

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
// allocation, then the glide path; and, for the fees and yield and the
// target allocation, what of them could move a rate, as Assumptions
// reads them: the fees and yield without the day they were set, and the
// allocation by each category's share and the class it is mapped onto,
// by id, without an import's day, its values, holdings or portfolios,
// or the categories' names and order. A reorder alone is taken as no
// change, though it can move a rate by its last bits, so a walk over
// one ends on the household now to the pound rather than to the bit.
const sources: readonly {
  readonly keys: readonly (keyof Kept)[];
  readonly read?: (kept: Kept) => unknown;
  readonly source: RateSource;
}[] = [
  { keys: ["rateSet"], source: "rateSet" },
  { keys: ["rates", "allocation"], source: "rates" },
  { keys: ["cma"], source: "cma" },
  { keys: ["curve"], source: "curve" },
  { keys: ["deductions"], read: deductedBy, source: "deductions" },
  { keys: ["targets", "mappings"], read: blendedBy, source: "targets" },
  { keys: ["glide"], source: "glide" },
];

// The records of a plan that a scenario and the household are told
// apart by, each matched by its id and called by what it is beside its
// name: an account by everything but its balance and the day it was
// set, which are the household's bookkeeping, as the areas read one.
const records: readonly {
  readonly kind: string;
  readonly read: (
    kept: Kept,
  ) => readonly { readonly id: number; readonly name: string }[];
}[] = [
  { kind: "Owner", read: ({ owners }) => owners },
  { kind: "Child", read: ({ children }) => children ?? [] },
  {
    kind: "Account",
    read: ({ accounts }) =>
      accounts.map((account) => ({ ...account, balance: 0, setOn: null })),
  },
  { kind: "Income", read: ({ schedule }) => schedule.income },
  { kind: "Expense", read: ({ schedule }) => schedule.expenses },
  { kind: "Milestone", read: ({ milestones }) => milestones },
];

// What making a scenario the household would change, a line at a time:
// each record of the plan, by its id, that only the scenario holds,
// that both hold but not the same, as the store would write them, or
// that only the household holds, in the order the scenario lists them
// and then the household; then the order of the accounts, where the
// scenario lists those both hold in another order than the household,
// since the order moves the spare money, as the areas read it, which a
// match by id alone does not see, and an account added or removed leaves
// the rest where they stand; then each setting of the plan that differs,
// the end age, the drawdown and each source of the rates the scenario
// carries over, each by the plan it holds rather than the bookkeeping
// beside it, as What moved reads it, which leaves out the CMA and the
// curve, since those are pulled into the household and planOver keeps
// the household's. It is handed what adopting the scenario would write
// where that can be written, so a category kept at 0% from the
// household's import reads as adopting leaves it, and the scenario as
// kept where it is refused, so the lines still stand: an account the
// household added since the scenario was made then reads as removed,
// which is what making the scenario the household would do.
export function changedIn(household: Kept, scenario: Kept): readonly Line[] {
  const settings: readonly {
    readonly keys: readonly (keyof Kept)[];
    readonly name: string;
    readonly read?: (kept: Kept) => unknown;
  }[] = [
    { keys: ["ages"], name: areaNames.ages },
    { keys: ["drawdown"], name: areaNames.drawdown },
    ...sources
      .filter(({ source }) => source !== "cma" && source !== "curve")
      .map(({ source, ...setting }) => ({
        ...setting,
        name: sourceNames[source],
      })),
  ];
  const shared = (one: Kept, other: Kept): readonly number[] => {
    const ids = new Set(other.accounts.map(({ id }) => id));
    return one.accounts.map(({ id }) => id).filter((id) => ids.has(id));
  };
  const order = "Order of the accounts";
  return [
    ...records.flatMap(({ kind, read }) => {
      const theirs = new Map(read(household).map((held) => [held.id, held]));
      const ours = new Set(read(scenario).map(({ id }) => id));
      const lineOf = (
        change: Line["change"],
        { id, name }: { readonly id: number; readonly name: string },
      ): Line => ({
        change,
        key: `${kind}:${String(id)}`,
        label: `${kind} · ${name}`,
      });
      return [
        ...read(scenario).flatMap((held) => {
          const was = theirs.get(held.id);
          if (was === undefined) {
            return [lineOf("added", held)];
          }
          return differs(was, held) ? [lineOf("changed", held)] : [];
        }),
        ...read(household)
          .filter(({ id }) => !ours.has(id))
          .map((held) => lineOf("removed", held)),
      ];
    }),
    ...(differs(shared(household, scenario), shared(scenario, household))
      ? [{ change: "changed", key: order, label: order } as const]
      : []),
    ...settings
      .filter(({ keys, read }) =>
        read === undefined
          ? keys.some((key) => differs(household[key], scenario[key]))
          : differs(read(household), read(scenario)),
      )
      .map(({ name }): Line => ({ change: "changed", key: name, label: name })),
  ];
}

// What the months monthsOn carried paid into the ISAs and the GIAs, the
// tax-free and taxable accounts, in whole pounds.
export function investedIn(months: readonly MonthsOn[]): number {
  return Math.round(
    sumOf(
      months.filter(({ account }) =>
        ["tax-free", "taxable"].includes(account.kind),
      ),
      ({ paid }) => paid,
    ),
  );
}

// What moved the plan from the balances a close set and the month they
// were as of, laid over the household now, to the household now, as
// movedSince walks it: an account both hold opens on the balance the
// close set it to, and the day it was set where the close kept one, or
// else the day it has now, and one only the household now holds on its
// balance now, outside the accounts the close set; one only the close
// set is left out, the household holding no record to carry it by. The
// rates and the household's own changes since are the household now's
// from the opening on, so neither is a step.
export function movedOver(closed: KeptBalances, now: Kept): Moved {
  const set = new Map(closed.accounts.map((account) => [account.id, account]));
  return movedSince(
    {
      ...now,
      accounts: now.accounts.map((account) => {
        const was = set.get(account.id);
        return was === undefined
          ? account
          : {
              ...account,
              balance: was.balance,
              ...(was.setOn !== undefined && { setOn: was.setOn }),
            };
      }),
      asOf: closed.asOf,
    },
    now,
    new Set(set.keys()),
  );
}

// What moved the plan from the household as the close before the latest
// left it to the household now, both kept and sound. The walk opens on
// what the month end expected: the household then, moved on to the
// month the balances are as of now, each balance at what monthsOn
// carries it to over the months between, to the pound, as the month
// end's worksheet opens on, but for an account outside those the close
// set, where they are given by id, which stays where it stood. monthsOn
// is what the month end expects
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
// not move where the worth is read, or the age the plan now ends at
// where it ends before that, so every state is read at an age it
// reaches. A group that changed nothing is skipped, and one leaving a
// state the rules refuse is taken together
// with the groups after it until the state is sound, the step naming
// each of them that changed something, so the steps always end on the
// household now: the last group is taken to carry a refused one there
// even where it changed nothing itself, and is then not named. A
// source of the rates is compared by what of it could move a rate, as
// Assumptions compares it, so an import or a confirmation that moves
// none is no step, and what of it moves no rate can be left as it was,
// so the steps end on the household now to the pound. Each step is
// worked out after the ones before it, so taken in another order a
// group's share of the move could differ. The balances' sums and what
// the plan paid in run over the accounts the close set alone. Refused
// in the rules' words where even the expected state is.
export function movedSince(
  before: Kept,
  now: Kept,
  ids: ReadonlySet<number> = new Set(before.accounts.map(({ id }) => id)),
): Moved {
  const then = soundKept(before).household;
  const { plan, schedule } = laidOut(then.accounts, then.schedule, then.plan);
  const months = Math.max(0, monthsBetween(before.asOf, now.asOf));
  const moving = monthsOn(before.accounts, schedule, { months, plan });
  const carried = moving.filter(({ account }) => ids.has(account.id));
  const expected: Kept = {
    ...before,
    accounts: moving.map(({ account, balance }) => ({
      ...account,
      balance: ids.has(account.id) ? Math.round(balance) : account.balance,
    })),
    asOf: now.asOf,
  };
  const opening = futureIn(expected);
  const { retired } = opening.future;
  const fixed =
    retired === null ? endAge(opening.plan) : ageIn(retired, opening.plan);
  const age = Math.min(fixed, endAge(soundKept(now).household.plan));
  const nowById = new Map(now.accounts.map((account) => [account.id, account]));
  const closed = (accounts: readonly Account[]): readonly Account[] =>
    accounts.map((account) => ({
      ...account,
      balance: nowById.get(account.id)?.balance ?? account.balance,
    }));
  const rates = sources
    .filter(({ keys, read }) =>
      read === undefined
        ? keys.some((key) => differs(before[key], now[key]))
        : differs(read(before), read(now)),
    )
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
    balances: balancesOf(carried, nowById, paidIn(now, before.asOf)),
    changes,
    expected: standing,
    fixed,
    invested: investedIn(carried),
    months,
    now: steps.at(-1)?.standing ?? standing,
    rates,
    steps,
  };
}

// What Portfolio Performance says was paid into each of its securities
// accounts, by name, after the cut of the month the balances stood at,
// up to and on the cut of the month they stand at now, but for a name
// two of the household's accounts carry; or nothing, where the file was
// imported before that cut, or before what was paid in was read, since
// it need not hold all that was paid by then.
export function paidIn(now: Kept, from: Month): ReadonlyMap<string, number> {
  const to = cutOf(now.asOf);
  const after = cutOf(from);
  const { targets } = now;
  const names = now.accounts.map(({ name }) => name);
  return targets?.portfolios === undefined || targets.importedOn < to
    ? new Map()
    : new Map(
        targets.portfolios
          .filter(({ name }) => names.indexOf(name) === names.lastIndexOf(name))
          .map(({ name, paid }) => [
            name,
            sumOf(
              paid.filter(({ on }) => on > after && on <= to),
              ({ amount }) => amount,
            ),
          ]),
      );
}

// What a kept household comes to at its own rates, as the dashboard's
// tiles read it off the one projection: the age it runs to, the age its
// owner retires at, and the net worth entering its last year.
export function sideOf(kept: Kept): Side {
  const { future, plan } = futureIn(kept);
  return {
    ends: endAge(plan),
    retires: future.retired === null ? null : ageIn(future.retired, plan),
    worth: endWorthOf(future),
  };
}

// Where a kept household's plan stands at its own rates, as a point
// keeps it once the month after is closed: the age the liquid net worth
// is read at, the one its owner retires at, or the one the plan runs to
// where they never do, as What moved reads it; that worth to the pound;
// and the age they retire at, or null.
export function standingOf(kept: Kept): NonNullable<KeptPoint["standing"]> {
  const { future, plan } = futureIn(kept);
  const age =
    future.retired === null ? endAge(plan) : ageIn(future.retired, plan);
  return {
    age,
    liquid: Math.round(standingAt(future, age).liquid),
    retires: future.retired === null ? null : age,
  };
}

// The balances the close set against those it closed from, over the
// accounts both hold: one whose day moved was checked, and was paid what
// Portfolio Performance says was paid into the securities account of its
// name, where it says, or else what the plan carried into it, the rest
// of its difference having moved it; one whose day did not was left as
// it stood.
function balancesOf(
  carried: readonly MonthsOn[],
  now: ReadonlyMap<number, Account>,
  actual: ReadonlyMap<string, number>,
): Balances {
  const both = carried.flatMap((reached) => {
    const closed = now.get(reached.account.id);
    return closed === undefined ? [] : [{ ...reached, closed }];
  });
  const checked = both.filter(
    ({ account, closed }) => closed.setOn !== account.setOn,
  );
  const stood = sumOf(both, ({ account }) => account.balance);
  const paid = Math.round(
    sumOf(
      checked,
      ({ closed, paid: planned }) => actual.get(closed.name) ?? planned,
    ),
  );
  const total = sumOf(both, ({ closed }) => closed.balance);
  return {
    actual: checked
      .map(({ closed }) => closed.name)
      .filter((name) => actual.has(name)),
    expected: sumOf(both, ({ balance }) => Math.round(balance)),
    moved: total - stood - paid,
    now: total,
    paid,
    planned: Math.round(sumOf(checked, (reached) => reached.paid)),
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
