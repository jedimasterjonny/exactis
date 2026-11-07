// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Kept } from "@/data/household";
import type { Month } from "@/data/schedule";
import type { Bands } from "@/engine/futures";

import { accounts, sipp } from "@/data/accounts.fixture";
import { expenseLines } from "@/data/expenses.fixture";
import { soundKept } from "@/data/household";
import { kept } from "@/data/household.fixture";
import { portfolios, targets } from "@/data/targets.fixture";
import { laidOut, monthsOn } from "@/engine/projection";
import { refused, saved } from "@/lib/answer";
import { cutOf } from "@/lib/months";

import type { KeptClose, Landed } from "./landed";

import { bandOf, landedSince } from "./landed";

// The reference household with its balances as of the month given, each
// set on that month's cut, as a close of it sets them, with whatever a
// test gives in their place.
function closedAt(asOf: Month, changes: Partial<Kept> = {}): Kept {
  return {
    ...kept,
    accounts: kept.accounts.map((account) => ({
      ...account,
      setOn: cutOf(asOf),
    })),
    asOf,
    ...changes,
  };
}

// A close kept as given, held to the rules as the store holds it, of
// the month its balances were as of.
function closeOf(before: Kept): KeptClose {
  return { before: saved(soundKept(before)), month: before.asOf };
}

// The reading of the close given against the household now given,
// which a test expects there to be.
function landedOf(close: Kept, at: Kept): Landed {
  const { landed } = landedSince([closeOf(close)], at);
  if (landed === null) {
    throw new Error("The close gives no reading");
  }
  return landed;
}

// How wide the middle half and the middle 80% of a reading's bands run.
function widthsOf({
  bottomQuarter,
  bottomTenth,
  topQuarter,
  topTenth,
}: Bands): readonly number[] {
  return [topQuarter - bottomQuarter, topTenth - bottomTenth];
}

const july = { month: 6, year: 2026 };
const august = { month: 7, year: 2026 };

// The reference closed onto August, its balances as July's close left
// them, so the futures of July's plan are read a month on.
const now = closedAt(august);
const before = closedAt(july);

describe("landedSince", () => {
  // The workplace pension and the ISA are the reference's two accounts
  // on the plan rate, £663,570 between them; the cash, the home and the
  // mortgage are on fixed rates and never read. Left where they stood,
  // they land below the middle future, which the plan's month grows.
  it("reads the invested balances of a close a month before against the futures of its plan", () => {
    expect(landedSince([closeOf(before)], now).passed).toStrictEqual([]);
    const landed = landedOf(before, now);
    expect(landed).toMatchObject({
      actual: 663_570,
      asOf: july,
      beyond: 0,
      isDrawing: false,
      left: 0,
      months: 1,
      paidBy: [],
      read: 2,
    });
    const { bottomQuarter, bottomTenth, middle, topQuarter, topTenth } =
      landed.bands;
    expect(bottomTenth).toBeLessThan(bottomQuarter);
    expect(bottomQuarter).toBeLessThan(middle);
    expect(middle).toBeLessThan(topQuarter);
    expect(topQuarter).toBeLessThan(topTenth);
    expect(middle).toBeGreaterThan(landed.actual);
  });

  // The same balances closed a month and a year before August: the
  // bands at a year run about the root of twelve as wide as at a month,
  // to within 10%, the year's growth and what the plan pays in widening
  // them a little past it.
  it("reads a close a year before over twelve months, its bands about the root of twelve as wide as a month's", () => {
    const year = landedOf({ ...before, asOf: { month: 7, year: 2025 } }, now);
    const atMonth = widthsOf(landedOf(before, now).bands);

    expect(year.months).toBe(12);
    for (const [index, width] of widthsOf(year.bands).entries()) {
      expect(
        Math.abs(width / (atMonth[index] ?? 0) / Math.sqrt(12) - 1),
      ).toBeLessThan(0.1);
    }
  });

  it("refuses a close no month before now, or more than twelve", () => {
    for (const asOf of [august, { month: 6, year: 2025 }]) {
      expect(() => landedSince([closeOf(closedAt(asOf))], now)).toThrow(
        "A close is read from one to twelve months back",
      );
    }
  });

  // The ISA unchecked at July's close, and the pension at August's: each
  // reading leaves the other out and counts it, and an account on the
  // plan rate opened since, the SIPP, is never read.
  it("leaves out an invested balance not checked at both closes, and counts it", () => {
    const [pension, isa] = accounts;
    const atJuly = landedOf(
      {
        ...before,
        accounts: before.accounts.map((account) =>
          account.id === isa.id ? { ...account, setOn: "2026-07-01" } : account,
        ),
      },
      now,
    );
    const atAugust = landedOf(before, {
      ...now,
      accounts: [
        ...now.accounts.map((account) =>
          account.id === pension.id
            ? { ...account, setOn: "2026-07-24" }
            : account,
        ),
        { ...sipp, balance: 4000, owner: 1, setOn: "2026-08-25" },
      ],
      next: 21,
    });

    expect(atJuly).toMatchObject({ actual: pension.balance, left: 1, read: 1 });
    expect(atAugust).toMatchObject({ actual: isa.balance, left: 1, read: 1 });
  });

  // Portfolio Performance read on the 26th of August says an invented
  // £3,000 went into the ISA on the 20th, beyond the twelfth of its
  // £20,000 the plan paid it less what the month's spending left short.
  it("shifts every band by what Portfolio Performance says was paid in beyond the plan, naming the accounts it says it of", () => {
    const paid = {
      ...now,
      targets: {
        ...targets,
        importedOn: "2026-08-26",
        portfolios: [
          {
            cash: 0,
            name: "Stocks & shares ISA",
            paid: [{ amount: 3000, on: "2026-08-20" }],
          },
        ],
      },
    };
    const plain = landedOf(before, now);
    const shifted = landedOf(before, paid);
    const household = soundKept(before).household;
    const { plan, schedule } = laidOut(
      household.accounts,
      household.schedule,
      household.plan,
    );
    const [, planned] = monthsOn(before.accounts, schedule, {
      months: 1,
      plan,
    });

    expect(shifted.paidBy).toStrictEqual(["Stocks & shares ISA"]);
    expect(shifted.beyond).toBeCloseTo(3000 - (planned?.paid ?? 0), 6);
    for (const band of [
      "bottomQuarter",
      "bottomTenth",
      "middle",
      "topQuarter",
      "topTenth",
    ] as const) {
      expect(shifted.bands[band] - shifted.beyond).toBeCloseTo(
        plain.bands[band],
        6,
      );
    }
  });

  // The ISA at August's close emptied, as it stood, and £2,000,000 up,
  // invented: below every future, between the bottom and the middle, and
  // above every one; then, as it stood, with Portfolio Performance saying
  // an invented £1,000,000 went into it, which lifts every future past it.
  it("reads the share of the futures the invested balances landed above, after the shift for what was paid in", () => {
    const isa = accounts[1];
    const isaAt = (balance: number, at: Kept = now): Kept => ({
      ...at,
      accounts: at.accounts.map((account) =>
        account.id === isa.id ? { ...account, balance } : account,
      ),
    });
    const paid = {
      ...now,
      targets: {
        ...targets,
        importedOn: "2026-08-26",
        portfolios: [
          {
            cash: 0,
            name: "Stocks & shares ISA",
            paid: [{ amount: 1_000_000, on: "2026-08-20" }],
          },
        ],
      },
    };
    const stood = landedOf(before, now);

    expect(landedOf(before, isaAt(0)).share).toBe(0);
    expect(stood.share).toBeGreaterThan(0);
    expect(stood.share).toBeLessThan(0.5);
    expect(landedOf(before, isaAt(isa.balance + 2_000_000)).share).toBe(1);
    expect(landedOf(before, paid).share).toBe(0);
  });

  it("shifts nothing where Portfolio Performance was imported before this close", () => {
    const stale = landedOf(before, {
      ...now,
      targets: { ...targets, importedOn: "2026-08-24", portfolios },
    });

    expect(stale).toMatchObject({ beyond: 0, paidBy: [] });
  });

  // An invented £20,000 a month going out, far past what comes in.
  it("says where the plan at its own rates leaves a month short", () => {
    const drawing = closedAt(july, {
      next: 31,
      schedule: {
        ...kept.schedule,
        expenses: [
          ...kept.schedule.expenses,
          { ...expenseLines[0], amount: 20_000, id: 30, name: "Invented" },
        ],
      },
    });

    expect(landedOf(drawing, now).isDrawing).toBe(true);
  });

  // March's close kept in a form this app cannot read, May's with no
  // CMA pulled, and June's with no balance dated: each is passed over,
  // and July's is read.
  it("passes over every close that cannot give a reading, oldest first, and reads the next", () => {
    const passing = [
      {
        before: refused("A rule since tightened"),
        month: { month: 2, year: 2026 },
      },
      closeOf(closedAt({ month: 4, year: 2026 }, { cma: null })),
      closeOf({ ...kept, asOf: { month: 5, year: 2026 } }),
    ];

    const { landed, passed } = landedSince([...passing, closeOf(before)], now);

    expect(passed).toStrictEqual([
      { kind: "unreadable", month: { month: 2, year: 2026 } },
      { kind: "short", month: { month: 4, year: 2026 } },
      { kind: "unchecked", month: { month: 5, year: 2026 } },
    ]);
    expect(landed?.asOf).toStrictEqual(july);
    expect(landedSince(passing, now)).toStrictEqual({ landed: null, passed });
    expect(landedSince([], now)).toStrictEqual({ landed: null, passed: [] });
  });
});

describe("bandOf", () => {
  // A reading of invented bands at 10, 20, 30, 40 and 50. The bottom
  // two are counted below the actual and the top two at or below it, so
  // an actual on one of the bottom two's edges falls in the band above
  // it, and one on the top two's in the band below.
  const landed: Landed = {
    actual: 0,
    asOf: july,
    bands: {
      bottomQuarter: 20,
      bottomTenth: 10,
      middle: 30,
      topQuarter: 40,
      topTenth: 50,
    },
    beyond: 0,
    isDrawing: false,
    left: 0,
    months: 1,
    paidBy: [],
    read: 1,
    share: 0,
  };

  it.each([
    [9, "bottom tenth"],
    [10, "bottom quarter"],
    [19, "bottom quarter"],
    [20, "middle half"],
    [40, "middle half"],
    [41, "top quarter"],
    [50, "top quarter"],
    [51, "top tenth"],
  ] as const)("names an actual of %i the %s", (actual, band) => {
    expect(bandOf({ ...landed, actual })).toBe(band);
  });
});
