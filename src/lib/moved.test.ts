// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Kept } from "@/data/household";

import { accounts, sipp } from "@/data/accounts.fixture";
import { children } from "@/data/children.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { soundKept } from "@/data/household";
import { kept } from "@/data/household.fixture";
import { incomeLines } from "@/data/income.fixture";
import { owners, sam } from "@/data/owners.fixture";
import { portfolios, targets } from "@/data/targets.fixture";
import { endWorthOf, futureOf } from "@/engine/futures";
import { laidOut, monthsOn, project } from "@/engine/projection";
import { Refusal } from "@/lib/answer";

import { changedIn, movedOver, movedSince, sideOf } from "./moved";

// The household's rules as they are, watched, so a test can have them
// refuse a state the walk takes.
vi.mock(import("@/data/household"), async (importOriginal) => {
  const household = await importOriginal();
  return { ...household, soundKept: vi.fn(household.soundKept) };
});

// The accounts given with one of them, by its id, changed as given.
function changed(
  accounts: readonly Account[],
  id: number,
  change: Partial<Account>,
): readonly Account[] {
  return accounts.map((account) =>
    account.id === id ? { ...account, ...change } : account,
  );
}

// A household closed the months given after the one it was closed at
// before, each balance at what the plan expected of it and dated on the
// day of the close, with whatever a test gives in their place.
function closed(
  from: Kept,
  { months = 1, ...changes }: Partial<Kept> & { readonly months?: number } = {},
): Kept {
  const { accounts, plan, schedule } = soundKept(from).household;
  const run = laidOut(accounts, schedule, plan);
  const carried = new Map(
    monthsOn(run.accounts, run.schedule, { months, plan: run.plan }).map(
      ({ account, balance }) => [account.id, Math.round(balance)],
    ),
  );
  const month = from.asOf.month + months;
  return {
    ...from,
    accounts: from.accounts.map((account) => ({
      ...account,
      balance: carried.get(account.id) ?? account.balance,
      setOn: "2026-10-02",
    })),
    asOf: { month: month % 12, year: from.asOf.year + Math.floor(month / 12) },
    ...changes,
  };
}

// The reference household as the close of August 2026 left it, its
// owner retiring once the plan is worth an invented £1.6m, with
// whatever a test gives in its place.
function closing(changes: Partial<Kept> = {}): Kept {
  return {
    ...kept,
    owners: [
      {
        ...owners[0],
        retirement: [{ measure: "worth", of: "pounds", times: 1_600_000 }],
      },
    ],
    ...changes,
  };
}

const before = closing();
const asPlanned = closed(before);

describe("movedSince", () => {
  it("moves nothing between a household and itself", () => {
    const moved = movedSince(before, before);

    expect(moved.months).toBe(0);
    expect(moved.steps).toStrictEqual([]);
    expect(moved.now).toStrictEqual(moved.expected);
    expect(moved.changes).toStrictEqual([]);
    expect(moved.rates).toStrictEqual([]);
  });

  // The month carries the fixture's £901,462 to £909,489: £5,330 paid
  // into the pension and off the mortgage, and £2,697 of growth and
  // interest besides. The owner retires once the plan is worth £1.6m,
  // in 2041, at 49, which is where the liquid worth is read.
  it("moves nothing where the month closed as the plan expected", () => {
    expect(movedSince(before, asPlanned)).toStrictEqual({
      age: 49,
      balances: {
        actual: [],
        expected: 909_489,
        moved: 2697,
        now: 909_489,
        paid: 5330,
        planned: 5330,
        stood: 901_462,
        unchecked: 0,
      },
      changes: [],
      expected: { liquid: 330_154, retired: 2041 },
      invested: 0,
      months: 1,
      now: { liquid: 330_154, retired: 2041 },
      rates: [],
      steps: [],
    });
  });

  // An invented £10,000 more in the ISA than the plan expected brings
  // the £1.6m forward a year, to 48, so the liquid worth at 49 is read a
  // year into drawing on it.
  it("takes a balance the plan did not expect as the balances' step alone", () => {
    const moved = movedSince(
      before,
      closed(before, {
        accounts: changed(asPlanned.accounts, 2, {
          balance: (asPlanned.accounts[1]?.balance ?? 0) + 10_000,
        }),
      }),
    );

    expect(moved.steps).toStrictEqual([
      { groups: ["balances"], standing: { liquid: 247_985, retired: 2040 } },
    ]);
    expect(moved.balances.now - moved.balances.expected).toBe(10_000);
    expect(moved.now).toStrictEqual(moved.steps[0]?.standing);
  });

  // The pension left as it stood: of the £5,330 the plan paid, only the
  // £980 off the mortgage is counted, and the pension reads as standing
  // still against the plan, £5,963 short of it.
  it("counts a balance left as it stood as unchecked, paid nothing", () => {
    const moved = movedSince(
      before,
      closed(before, {
        accounts: [accounts[0], ...asPlanned.accounts.slice(1)],
      }),
    );

    expect(moved.balances).toStrictEqual({
      actual: [],
      expected: 909_489,
      moved: 1084,
      now: 903_526,
      paid: 980,
      planned: 980,
      stood: 901_462,
      unchecked: 1,
    });
    expect(moved.steps.map(({ groups }) => groups)).toStrictEqual([
      ["balances"],
    ]);
  });

  // August is cut on Tuesday the 25th and September on Friday the 25th,
  // so of what the fixture's accounts were paid, the ISA's £1,500 and
  // the pension's £2,376 less £40 fall between the two, and the
  // payments on the 25th of August before them. They stand in for the
  // plan's £4,350 into the pension and nothing into the ISA, beside the
  // £980 the plan paid off the mortgage, and what is left of the
  // difference moved the balances. The brokerage account has no account
  // of its name.
  it("takes what Portfolio Performance says was paid into an account of its name between the two cuts", () => {
    const imported = (importedOn: string): Kept =>
      closed(before, { targets: { ...targets, importedOn, portfolios } });

    expect(movedSince(before, imported("2026-09-25")).balances).toStrictEqual({
      actual: ["Workplace pension", "Stocks & shares ISA"],
      expected: 909_489,
      moved: 3211,
      now: 909_489,
      paid: 4816,
      planned: 5330,
      stood: 901_462,
      unchecked: 0,
    });
  });

  // The current account named as the pension is, so which of the two
  // the pension's £2,336 was paid into cannot be told, and the plan's
  // £4,350 stands for the pension instead.
  it("takes the plan's paid in for a name two accounts carry", () => {
    const named = closing({
      accounts: changed(kept.accounts, 3, { name: "Workplace pension" }),
    });
    const now = closed(named, {
      targets: { ...targets, importedOn: "2026-09-25", portfolios },
    });

    expect(movedSince(named, now).balances).toMatchObject({
      actual: ["Stocks & shares ISA"],
      moved: 1197,
      paid: 6830,
    });
  });

  // Imported on the 24th, the file need not hold all that was paid by
  // September's cut on the 25th, and with no target allocation there is
  // nothing it says.
  it("takes the plan's paid in where the file was imported before the cut, or none is", () => {
    for (const changes of [
      { targets: { ...targets, importedOn: "2026-09-24", portfolios } },
      { targets: null },
    ]) {
      expect(
        movedSince(before, closed(before, changes)).balances,
      ).toMatchObject({ actual: [], paid: 5330 });
    }
  });

  // The month made short by an invented £9,000 a month of spending,
  // which the plan would draw out of the cash: the month end draws
  // nothing, so the £8,000 the statement shows drawn is the balances'.
  it("reads what a short month drew on the savings as the balances' move", () => {
    const short = closing({
      accounts: changed(kept.accounts, 6, { isDroppable: true }),
      next: 31,
      schedule: {
        ...kept.schedule,
        expenses: [
          ...kept.schedule.expenses,
          { ...expenseLines[0], amount: 9000, id: 30, name: "Invented" },
        ],
      },
    });
    const expected = closed(short);

    expect(expected.accounts[2]?.balance).toBe(short.accounts[2]?.balance);

    const moved = movedSince(
      short,
      closed(short, {
        accounts: changed(expected.accounts, 3, {
          balance: (short.accounts[2]?.balance ?? 0) - 8000,
        }),
      }),
    );

    expect(moved.steps.map(({ groups }) => groups)).toStrictEqual([
      ["balances"],
    ]);
    expect(moved.balances.now - moved.balances.expected).toBe(-8000);
  });

  // The stocks typed at 6% rather than 5%, and the fees at a quarter of
  // a point, are one step, naming the rates typed and the fees.
  it("takes the rates and their sources as a step of their own", () => {
    const moved = movedSince(
      before,
      closed(before, {
        deductions: { ...before.deductions, fees: 0.0025 },
        rates: { ...before.rates, stocks: 0.06 },
      }),
    );

    expect(moved.rates).toStrictEqual(["rates", "deductions"]);
    expect(moved.changes).toStrictEqual([]);
    expect(moved.steps).toStrictEqual([
      { groups: ["rates"], standing: { liquid: 80_636, retired: 2038 } },
    ]);
  });

  // An invented line of £500 a month from 2026, a child and a plan
  // running to 95 are the household's own changes, named in the order
  // the screens hold them.
  it("takes every other change as the last step, naming what changed", () => {
    const moved = movedSince(
      before,
      closed(before, {
        ages: { ends: 95 },
        children: [children[0]],
        next: 31,
        schedule: {
          ...before.schedule,
          expenses: [
            ...before.schedule.expenses,
            { ...expenseLines[0], amount: 500, id: 30, name: "Invented" },
          ],
        },
      }),
    );

    expect(moved.changes).toStrictEqual(["children", "schedule", "ages"]);
    expect(moved.rates).toStrictEqual([]);
    expect(moved.steps).toStrictEqual([
      { groups: ["changes"], standing: { liquid: 269_796, retired: 2042 } },
    ]);
  });

  // The SIPP opened and the current account closed since: neither is in
  // the balances' sums, which run over the accounts both hold, and both
  // are the household's changes.
  it("takes accounts added or removed as changes, and sums the balances both hold", () => {
    const moved = movedSince(
      before,
      closed(before, {
        accounts: [
          ...asPlanned.accounts.filter(({ id }) => id !== 3),
          { ...sipp, balance: 4000, owner: 1 },
        ],
        next: 21,
      }),
    );

    expect(moved.changes).toStrictEqual(["accounts"]);
    expect(moved.steps.map(({ groups }) => groups)).toStrictEqual([
      ["changes"],
    ]);
    expect(moved.balances.stood).toBe(901_462 - 16_900);
  });

  // The current account turned into a debt of £500: its balance below
  // nothing is refused on a current account, so the balances are taken
  // together with the change of kind, and the step names both.
  it("takes a group the rules refuse together with the groups after it", () => {
    const moved = movedSince(
      before,
      closed(before, {
        accounts: changed(asPlanned.accounts, 3, {
          balance: -500,
          kind: "debt",
        }),
      }),
    );

    expect(moved.steps.map(({ groups }) => groups)).toStrictEqual([
      ["balances", "changes"],
    ]);
    expect(moved.changes).toStrictEqual(["accounts"]);
  });

  // The rules refusing the ISA's invented £10,000 over the plan on the
  // household as it stood, as a rule tightened since might, but not on
  // the household now, which differs from it only in its points: the
  // step carrying the balances there names them alone.
  it("names only the groups that changed in a step carried to the household now", async () => {
    const isa = (asPlanned.accounts[1]?.balance ?? 0) + 10_000;
    const now = closed(before, {
      accounts: changed(asPlanned.accounts, 2, { balance: isa }),
      points: [
        ...before.points,
        ...before.points
          .slice(-1)
          .map((point) => ({ ...point, month: asPlanned.asOf })),
      ],
    });
    const { soundKept: rules } = await vi.importActual<{
      readonly soundKept: typeof soundKept;
    }>("@/data/household");
    vi.mocked(soundKept).mockImplementation((value) => {
      const kept = JSON.stringify(value);
      if (
        kept.includes(`"balance":${String(isa)}`) &&
        !kept.includes(JSON.stringify(now.points))
      ) {
        throw new Refusal("A rule since tightened");
      }
      return rules(value);
    });

    const moved = movedSince(before, now);

    expect(moved.changes).toStrictEqual([]);
    expect(moved.rates).toStrictEqual([]);
    expect(moved.steps.map(({ groups }) => groups)).toStrictEqual([
      ["balances"],
    ]);
  });

  it("carries the plan's expectation over every month since the close", () => {
    const moved = movedSince(before, closed(before, { months: 3 }));

    expect(moved.months).toBe(3);
    expect(moved.steps).toStrictEqual([]);
  });

  // Worth an invented £100m is never reached, so there is no year, and
  // the liquid worth is read at 91, where the plan ends.
  it("says never where the plan's owner never retires, and reads the worth at the plan's end", () => {
    const never = closing({
      owners: [
        {
          ...owners[0],
          retirement: [{ measure: "worth", of: "pounds", times: 100_000_000 }],
        },
      ],
    });
    const moved = movedSince(never, closed(never));

    expect(moved.age).toBe(91);
    expect(moved.expected.retired).toBeNull();
  });

  // With none of the reference's spending the month pays the ISA a
  // twelfth of its £20,000.
  it("says what the plan paid into the ISAs and the GIAs over the months closed", () => {
    const spare = closing({ schedule: { ...kept.schedule, expenses: [] } });

    expect(movedSince(spare, closed(spare)).invested).toBe(1667);
  });
});

describe("movedOver", () => {
  // The reference as the close of August left it, each balance set on
  // the day of that close, as a close sets them.
  const dated = closing({
    accounts: kept.accounts.map((account) => ({
      ...account,
      setOn: "2026-08-25",
    })),
  });
  const set = { accounts: dated.accounts, asOf: dated.asOf };

  // Only the ISA's invented £10,000 over the plan since, so the
  // household now holds the plan August's close left.
  it("walks a close's balances laid over the household now as movedSince walks the household that close left", () => {
    const expected = closed(dated);
    const now = closed(dated, {
      accounts: changed(expected.accounts, 2, {
        balance: (expected.accounts[1]?.balance ?? 0) + 10_000,
      }),
    });

    expect(movedOver(set, now)).toStrictEqual(movedSince(dated, now));
  });

  // The stocks typed at 6% rather than 5% since: the month end expects
  // 6% of August's balances, so the step is the balances' alone, and it
  // ends on the year the household now retires in.
  it("takes the rates changed since into what the month end expected, rather than a step", () => {
    const now = closed(dated, { rates: { ...dated.rates, stocks: 0.06 } });
    const moved = movedOver(set, now);

    expect(moved.rates).toStrictEqual([]);
    expect(moved.steps.map(({ groups }) => groups)).toStrictEqual([
      ["balances"],
    ]);
    expect(moved.now.retired).toBe(movedSince(dated, now).now.retired);
  });

  // The SIPP opened since at an invented £4,000, and the current account
  // closed: the SIPP opens where it stands now and the current account
  // is left out, so neither is in the balances' sums.
  it("holds an account opened since where it stands, and leaves out one closed", () => {
    const now = closed(dated, {
      accounts: [
        ...closed(dated).accounts.filter(({ id }) => id !== 3),
        { ...sipp, balance: 4000, owner: 1 },
      ],
      next: 21,
    });
    const moved = movedOver(set, now);

    expect(moved.balances).toMatchObject({
      stood: 901_462 - 16_900,
      unchecked: 0,
    });
    expect(moved.changes).toStrictEqual([]);
  });
});

describe("changedIn", () => {
  // The household's pension set to £420,000 on the tenth and a CMA and
  // curve of nobody's, which are bookkeeping rather than the plan.
  it("finds no line between a household and itself, nor in its balances, their days or what was pulled", () => {
    expect(changedIn(kept, kept)).toStrictEqual([]);
    expect(
      changedIn(kept, {
        ...kept,
        accounts: changed(kept.accounts, 6, {
          balance: 420_000,
          setOn: "2026-09-10",
        }),
        cma: null,
        curve: null,
      }),
    ).toStrictEqual([]);
  });

  // A scenario that adds Sam and Ada, retires its owner at 58, takes
  // away the pension, earns on the current account, opens premium
  // bonds, raises the salary, drops the childcare, renames Downsize,
  // runs the plan to 95, draws the pension first, sets a glide path,
  // raises the fees and runs on the CMA's rates.
  it("lists each record the scenario added, changed or removed by its kind and name, then each setting by its name", () => {
    const [me] = owners;
    const scenario: Kept = {
      ...kept,
      accounts: [
        ...changed(kept.accounts, 3, {
          growth: { kind: "fixed", rate: 0.03 },
        }).filter(({ id }) => id !== 6),
        {
          balance: 5000,
          growth: { kind: "fixed", rate: 0.04 },
          id: 20,
          kind: "cash",
          name: "Premium bonds",
        },
      ],
      ages: { ends: 95 },
      children: children.slice(0, 1),
      deductions: { ...kept.deductions, fees: 0.004 },
      drawdown: "pension-first",
      glide: [{ age: 60, bonds: 0.4 }],
      milestones: kept.milestones.map((milestone) =>
        milestone.id === 8
          ? { ...milestone, name: "Move to the coast" }
          : milestone,
      ),
      next: 21,
      owners: [
        { ...me, retirement: [{ measure: "age", of: "years", times: 58 }] },
        sam,
      ],
      rateSet: "cma",
      schedule: {
        expenses: kept.schedule.expenses.filter(({ id }) => id !== 12),
        income: kept.schedule.income.map((line) =>
          line.id === 16 ? { ...line, amount: line.amount + 1000 } : line,
        ),
      },
    };

    expect(changedIn(kept, scenario)).toStrictEqual([
      { change: "changed", key: "Owner:1", label: "Owner · Me" },
      { change: "added", key: "Owner:2", label: "Owner · Sam" },
      { change: "added", key: "Child:20", label: "Child · Ada" },
      {
        change: "changed",
        key: "Account:3",
        label: "Account · Current account",
      },
      { change: "added", key: "Account:20", label: "Account · Premium bonds" },
      {
        change: "removed",
        key: "Account:6",
        label: "Account · Workplace pension",
      },
      { change: "changed", key: "Income:16", label: "Income · Salary" },
      { change: "removed", key: "Expense:12", label: "Expense · Childcare" },
      {
        change: "changed",
        key: "Milestone:8",
        label: "Milestone · Move to the coast",
      },
      { change: "changed", key: "Plan end age", label: "Plan end age" },
      { change: "changed", key: "Drawdown", label: "Drawdown" },
      { change: "changed", key: "Set of rates", label: "Set of rates" },
      { change: "changed", key: "Fees and yield", label: "Fees and yield" },
      { change: "changed", key: "Glide path", label: "Glide path" },
    ]);
  });

  // The scenario lists the ISA before the pension, which moves the spare
  // money; then one that takes the pension away and opens premium bonds
  // ahead of the rest, which moves none of them.
  it("lists the order of the accounts where the scenario reorders those both hold, and not for one added or removed", () => {
    const [pension, isa, ...rest] = accounts;
    const bonds: Account = {
      balance: 5000,
      growth: { kind: "fixed", rate: 0.04 },
      id: 20,
      kind: "cash",
      name: "Premium bonds",
    };

    expect(
      changedIn(kept, { ...kept, accounts: [isa, pension, ...rest] }),
    ).toStrictEqual([
      {
        change: "changed",
        key: "Order of the accounts",
        label: "Order of the accounts",
      },
    ]);
    expect(
      changedIn(kept, { ...kept, accounts: [bonds, isa, ...rest], next: 21 }),
    ).toStrictEqual([
      { change: "added", key: "Account:20", label: "Account · Premium bonds" },
      {
        change: "removed",
        key: "Account:6",
        label: "Account · Workplace pension",
      },
    ]);
  });

  // An income line and an expense line both called Bonus, the expense
  // the scenario's alone.
  it("tells two records of one name apart by what they are", () => {
    const [salary] = incomeLines;
    const [household] = expenseLines;
    const bonuses: Kept = {
      ...kept,
      next: 22,
      schedule: {
        expenses: kept.schedule.expenses,
        income: [...kept.schedule.income, { ...salary, id: 20, name: "Bonus" }],
      },
    };

    expect(
      changedIn(bonuses, {
        ...bonuses,
        schedule: {
          ...bonuses.schedule,
          expenses: [
            ...kept.schedule.expenses,
            { ...household, id: 21, name: "Bonus" },
          ],
        },
      }),
    ).toStrictEqual([
      { change: "added", key: "Expense:21", label: "Expense · Bonus" },
    ]);
  });
});

describe("sideOf", () => {
  // The reference household's owner, born in 1992, retires at 61 in a
  // plan running to 91.
  it("reads the age a plan's owner retires at and the net worth it holds entering its last year, at its own rates", () => {
    const { accounts: held, plan, schedule } = soundKept(kept).household;

    expect(sideOf(kept)).toStrictEqual({
      ends: 91,
      retires: 61,
      worth: endWorthOf(
        futureOf(project(held, schedule, plan), {
          accounts: held,
          plan,
          schedule,
        }),
      ),
    });
  });

  it("reads no retirement where its owner never retires by the plan's end", () => {
    expect(
      sideOf(
        closing({
          owners: [
            {
              ...owners[0],
              retirement: [{ measure: "worth", of: "pounds", times: 1e12 }],
            },
          ],
        }),
      ).retires,
    ).toBeNull();
  });
});
