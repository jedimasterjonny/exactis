// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { Account } from "@/data/accounts";
import type { Kept } from "@/data/household";

import { accounts, sipp } from "@/data/accounts.fixture";
import { children } from "@/data/children.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { soundKept } from "@/data/household";
import { kept } from "@/data/household.fixture";
import { owners } from "@/data/owners.fixture";
import { laidOut, monthsOn } from "@/engine/projection";
import { Refusal } from "@/lib/answer";

import { movedSince } from "./moved";

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
        expected: 909_489,
        moved: 2697,
        now: 909_489,
        paid: 5330,
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
      expected: 909_489,
      moved: 1084,
      now: 903_526,
      paid: 980,
      stood: 901_462,
      unchecked: 1,
    });
    expect(moved.steps.map(({ groups }) => groups)).toStrictEqual([
      ["balances"],
    ]);
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
