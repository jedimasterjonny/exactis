// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { LineValues } from "@/data/schedule";

import { accounts } from "@/data/accounts.fixture";
import {
  homeValues as home,
  homePart,
  house,
  houseLoan,
  move,
} from "@/data/houses.fixture";
import { retiring } from "@/data/income.fixture";
import { markersOf } from "@/data/milestones";
import { milestones } from "@/data/milestones.fixture";

import type { MoveValues, PartDraft } from "./houses";

import {
  derive,
  drawnAsMortgages,
  houseOf,
  isSound,
  mortgageLine,
  mortgageOn,
  moveChoices,
  toRecords,
} from "./houses";

const draft: PartDraft = { ...homePart, key: 0, term: 26 };

// The fixture's move as the dialog holds it: at the children leaving
// home in 2040, to £650,000 held to £800,000, borrowing up to 90% at
// 4.5% over 25 years.
const moving: MoveValues = {
  at: 7,
  ceiling: 800000,
  loanToValue: 0.9,
  price: 650000,
  rate: 0.045,
  term: 25,
  year: 2040,
};

// The plan read in September 2026, so eight months of the year are gone.
const plan = { from: 2026, month: 8 };

describe("derive", () => {
  it("works each figure out from the other two, the payment to the pound", () => {
    expect(derive(draft, "payment")).toBe(1889);
    expect(derive(draft, "rate")).toBeCloseTo(0.0628, 4);
    expect(derive(draft, "term")).toBeCloseTo(20.02, 2);
  });
});

describe("isSound", () => {
  it("wants a name, a price it was bought for, and a mortgage in a sub-account at least, each owing and paying something at a rate no lower than nothing", () => {
    expect(isSound(home)).toBe(true);
    expect(isSound({ ...home, parts: [homePart, homePart] })).toBe(true);
    expect(isSound({ ...home, name: "  " })).toBe(false);
    expect(isSound({ ...home, bought: { ...home.bought, price: 0 } })).toBe(
      false,
    );
    expect(isSound({ ...home, parts: [] })).toBe(false);
    expect(isSound({ ...home, parts: [{ ...homePart, balance: 0 }] })).toBe(
      false,
    );
    expect(
      isSound({ ...home, parts: [homePart, { ...homePart, payment: 0 }] }),
    ).toBe(false);
    expect(isSound({ ...home, parts: [{ ...homePart, rate: -0.01 }] })).toBe(
      false,
    );
    expect(isSound({ ...home, parts: [], status: "outright" })).toBe(true);
  });

  it("wants a ceiling, if the house has one, no lower than what it is worth", () => {
    expect(isSound({ ...home, ceiling: home.value })).toBe(true);
    expect(isSound({ ...home, ceiling: home.value - 1 })).toBe(false);
  });

  it("wants a move to cost something, under any ceiling it carries, and to borrow only on a house mortgaged now, over whole years", () => {
    const outright = { ...home, parts: [], status: "outright" } as const;

    expect(isSound({ ...home, move: moving })).toBe(true);
    expect(isSound({ ...home, move: { ...moving, ceiling: 0 } })).toBe(true);
    expect(isSound({ ...home, move: { ...moving, price: 0 } })).toBe(false);
    expect(isSound({ ...home, move: { ...moving, ceiling: 649999 } })).toBe(
      false,
    );
    expect(isSound({ ...home, move: { ...moving, term: 0 } })).toBe(false);
    expect(isSound({ ...home, move: { ...moving, term: 2.5 } })).toBe(false);
    expect(isSound({ ...outright, move: moving })).toBe(false);
    expect(
      isSound({ ...outright, move: { ...moving, loanToValue: 0, term: 0 } }),
    ).toBe(true);
  });
});

describe("moveChoices", () => {
  // The reference plan runs from 2026 to 2083, its owner retiring in
  // 2053; the children leave home in 2040 and the downsize is in 2059.
  const markers = markersOf(milestones, retiring);
  const kidsLeave = { id: 7, name: "Kids leave home", year: 2040 };
  const downsize = { id: 8, name: "Downsize", year: 2059 };

  it("offers each milestone the household lists within the plan's years, and not retirement", () => {
    expect(moveChoices(markers, retiring, [])).toStrictEqual([
      kidsLeave,
      downsize,
    ]);
  });

  // A plan to 2046 ends before the downsize, and one from 2044 opens
  // after the children leave.
  it("leaves out one before the plan or past its end, unless a house moves at it already", () => {
    const shorter = { ...retiring, years: 20 };

    expect(moveChoices(markers, shorter, [])).toStrictEqual([kidsLeave]);
    expect(
      moveChoices(markers, shorter, [
        { ...house, move: { ...move, at: 8, year: 2059 } },
      ]),
    ).toStrictEqual([kidsLeave, downsize]);
    expect(
      moveChoices(markers, { ...retiring, from: 2044, years: 39 }, []),
    ).toStrictEqual([downsize]);
  });
});

describe("mortgageOn", () => {
  it("draws a house's loans as one mortgage only when there is more than one", () => {
    const parted = {
      asset: house,
      loans: [houseLoan, { ...houseLoan, id: 6 }],
    };

    expect(mortgageOn(parted)).toStrictEqual({
      ids: new Set([5, 6]),
      name: "Home mortgage",
    });
    expect(mortgageOn({ ...parted, loans: [houseLoan] })).toBeNull();
    expect(
      mortgageOn({ ...parted, asset: { ...house, kind: "car" } }),
    ).toBeNull();
  });
});

describe("drawnAsMortgages", () => {
  // The home's mortgage in two sub-accounts, 5 and 6, and a car's loan,
  // 8, on a car, 7, alone.
  const held = [
    house,
    houseLoan,
    { ...houseLoan, id: 6 },
    { ...house, id: 7, kind: "car" as const },
    { ...houseLoan, id: 8, secures: 7 },
  ];
  const drawing = {
    debtOf: (debt: number | undefined): number | undefined => debt,
    merged: (together: readonly (number | undefined)[]): number =>
      together.reduce<number>((sum, debt) => sum + (debt ?? 0) * 10, 0),
  };

  it("merges what is against a mortgage's sub-accounts in the place of the first, and leaves every other as it is", () => {
    expect(
      drawnAsMortgages([1, 6, 8, 5, undefined], held, drawing),
    ).toStrictEqual([1, 110, 8, undefined]);
  });

  it("leaves what is against a mortgage in one sub-account as it is", () => {
    expect(
      drawnAsMortgages(
        [5],
        held.filter(({ id }) => id !== 6),
        drawing,
      ),
    ).toStrictEqual([5]);
  });
});

describe("mortgageLine", () => {
  const mortgage = { ids: new Set([5, 6]), name: "Home mortgage" };
  const line: LineValues = {
    amount: 2180,
    cadence: "month",
    endsAfter: 0,
    endsAt: null,
    firstYear: 2026,
    growth: "nominal",
    lastMonth: 5,
    lastYear: 2035,
    name: "Home mortgage 1",
    startsAt: null,
  };
  const start = { month: plan.month, year: plan.from };

  // A year with no month runs through its December, so it outlasts
  // June; no year at all outlasts every one.
  it("pays what the lines pay together, from the first's start to the end of the longest", () => {
    const through = { ...line, amount: 400, lastMonth: null };

    expect(mortgageLine([line, through], mortgage, start)).toStrictEqual({
      ...line,
      amount: 2580,
      lastMonth: null,
      lastYear: 2035,
      name: "Home mortgage",
    });
    expect(mortgageLine([through, line], mortgage, start)).toMatchObject({
      amount: 2580,
      lastMonth: null,
      lastYear: 2035,
    });
    expect(
      mortgageLine(
        [line, { ...line, lastYear: null }, { ...line, lastYear: 2050 }],
        mortgage,
        start,
      ),
    ).toMatchObject({ amount: 6540, lastYear: null });
  });

  // A sub-account cleared before the plan's September 2026 has its line
  // end in August, starting the year before where the plan starts in
  // January, and is paid nothing in the plan; with every one cleared,
  // the mortgage is drawn from them all.
  it("counts nothing a sub-account cleared before the plan pays, unless every one has", () => {
    const cleared = { ...line, firstYear: 2025, lastMonth: 7, lastYear: 2026 };
    const paying = { ...line, amount: 400, lastYear: 2044 };

    expect(mortgageLine([cleared, paying], mortgage, start)).toStrictEqual({
      ...paying,
      name: "Home mortgage",
    });
    expect(
      mortgageLine([cleared, { ...cleared, amount: 400 }], mortgage, start),
    ).toStrictEqual({ ...cleared, amount: 2580, name: "Home mortgage" });
  });
});

describe("houseOf", () => {
  // The fixture's home as a house, with its mortgage secured on it: the
  // loan's £176,520 owed comes back positive and its £2,180 a month is
  // the payment; a second loan is a second sub-account, after the first;
  // without a loan the house is owned outright; and its limit is its
  // ceiling, nothing where it has none.
  it("reads a house's values back off its records", () => {
    const pair = { asset: house, loans: [houseLoan] };
    const owed = { balance: 176520, payment: 2180, rate: 0.0485 };

    expect(houseOf(pair, plan)).toStrictEqual({
      bought: { month: { month: 9, year: 2021 }, price: 380000 },
      ceiling: 0,
      growth: 0.021,
      move: null,
      name: "Home",
      parts: [owed],
      status: "mortgaged",
      value: 397512,
    });
    expect(
      houseOf(
        {
          ...pair,
          loans: [
            houseLoan,
            {
              ...houseLoan,
              balance: -60000,
              contribution: { amount: 400, cadence: "month", kind: "fixed" },
              growth: { kind: "fixed", rate: 0.039 },
              id: 6,
            },
          ],
        },
        plan,
      ).parts,
    ).toStrictEqual([owed, { balance: 60000, payment: 400, rate: 0.039 }]);
    expect(houseOf({ ...pair, loans: [] }, plan)).toStrictEqual({
      bought: { month: { month: 9, year: 2021 }, price: 380000 },
      ceiling: 0,
      growth: 0.021,
      move: null,
      name: "Home",
      parts: [],
      status: "outright",
      value: 397512,
    });
    expect(
      houseOf({ ...pair, asset: { ...house, limit: 600000 } }, plan).ceiling,
    ).toBe(600000);
  });

  // A move kept with a ceiling and a mortgage reads back as it was, and
  // one with neither reads them as nothing, over the term a mortgage
  // opens on.
  it("reads a move flat, a ceiling and a mortgage it does not carry as nothing", () => {
    const pair = { asset: { ...house, move }, loans: [houseLoan] };

    expect(houseOf(pair, plan).move).toStrictEqual(moving);
    expect(
      houseOf(
        {
          ...pair,
          asset: { ...house, move: { at: 8, price: 300000, year: 2059 } },
        },
        plan,
      ).move,
    ).toStrictEqual({
      at: 8,
      ceiling: 0,
      loanToValue: 0,
      price: 300000,
      rate: 0,
      term: 25,
      year: 2059,
    });
  });

  // The household holds a house to carrying its purchase, so a record
  // without one reaches the dialog only as a new house does: it opens
  // on the plan's month, for nothing, and the save holds until it is
  // typed.
  it("opens a house kept without its purchase on the plan's month for nothing", () => {
    const [, , , unbought] = accounts;

    expect(
      houseOf({ asset: { ...unbought, kind: "house" }, loans: [] }, plan)
        .bought,
    ).toStrictEqual({ month: { month: 8, year: 2026 }, price: 0 });
  });
});

describe("toRecords", () => {
  it("writes a house owned outright as a real asset growing at its own rate, held to its ceiling if it has one", () => {
    expect(
      toRecords({ ...home, parts: [], status: "outright" }, plan),
    ).toStrictEqual({
      asset: {
        balance: 397512,
        balloon: 0,
        bought: { month: { month: 9, year: 2021 }, price: 380000 },
        cadence: "year",
        cap: 0,
        contribution: 0,
        funding: "fixed",
        growth: "fixed",
        isAlwaysFunded: false,
        kind: "house",
        name: "Home",
        owner: null,
        rate: 0.021,
      },
      loans: [],
    });
    expect(toRecords({ ...home, ceiling: 600000 }, plan).asset.limit).toBe(
      600000,
    );
  });

  // A ceiling of nothing is none and a share of nothing borrows
  // nothing, so neither is kept.
  it("writes a move with the house as the records keep it", () => {
    expect(toRecords({ ...home, move: moving }, plan).asset.move).toStrictEqual(
      move,
    );
    expect(
      toRecords(
        { ...home, move: { ...moving, ceiling: 0, loanToValue: 0 } },
        plan,
      ).asset.move,
    ).toStrictEqual({ at: 7, price: 650000, year: 2040 });
    expect(toRecords(home, plan).asset).not.toHaveProperty("move");
  });

  // Its payments' end is the loan's to say, worked out when the
  // household is read, so the line is saved from the plan's first year
  // and open-ended.
  it("writes a mortgaged house with the loan against it and its payments from the plan's first year, their end left to the loan", () => {
    const { asset, loans } = toRecords(home, plan);

    expect(asset.name).toBe("Home");
    expect(loans).toStrictEqual([
      {
        account: {
          balance: -334670,
          balloon: 0,
          cadence: "month",
          cap: 0,
          contribution: 2180,
          funding: "fixed",
          growth: "fixed",
          isAlwaysFunded: false,
          kind: "debt",
          name: "Home mortgage",
          owner: null,
          rate: 0.0485,
        },
        line: {
          amount: 2180,
          cadence: "month",
          endsAfter: 0,
          endsAt: null,
          firstYear: 2026,
          growth: "nominal",
          lastMonth: null,
          lastYear: null,
          name: "Home mortgage",
          startsAt: null,
        },
      },
    ]);
  });

  // Each sub-account is a loan of its own with its own payments, named
  // by its place so the month end can tell them apart.
  it("writes a mortgage in sub-accounts as a loan each, in their order, numbered", () => {
    const { loans } = toRecords(
      {
        ...home,
        parts: [homePart, { balance: 60000, payment: 400, rate: 0.039 }],
      },
      plan,
    );

    expect(
      loans.map(({ account, line }) => [
        account.name,
        account.balance,
        account.rate,
        line.name,
        line.amount,
      ]),
    ).toStrictEqual([
      ["Home mortgage 1", -334670, 0.0485, "Home mortgage 1", 2180],
      ["Home mortgage 2", -60000, 0.039, "Home mortgage 2", 400],
    ]);
  });
});
