// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { atAge } from "@/data/milestones";
import { owners, sam } from "@/data/owners.fixture";
import { allInStocks, openingRates, planRate } from "@/data/rates";
import { allocation, rates } from "@/data/rates.fixture";
import { termOf } from "@/lib/loans";

import {
  ageIn,
  debtTermOf,
  earnerOf,
  endAge,
  holderOf,
  inflationIn,
  loggedSpread,
  marginOf,
  planOf,
  pricesIn,
  rateIn,
  risenBy,
  risenWith,
  statedSpread,
} from "./plan";

// The rates a household opens with, 5% for stocks and bonds alike and
// the Bank's 2% target, and everything in stocks, typed, so rebalancing
// earns nothing over them.
const opening = {
  allocation: allInStocks,
  rates: openingRates,
  rebalancing: 0,
};

// The reference plan as the store sets it: to 91, its balances as of
// September 2026, so running from October, for the owners fixture's
// one owner, born in 1992 and retiring at 61.
const setting = { ages: { ends: 91 }, asOf: { month: 8, year: 2026 }, owners };

describe("ageIn", () => {
  it("reads the age the plan's owner reaches in a year, and in the plan's last", () => {
    const plan = planOf(setting, opening);

    expect(ageIn(2026, plan)).toBe(34);
    expect(endAge(plan)).toBe(91);
  });
});

describe("debtTermOf", () => {
  const plan = planOf(setting, opening);

  // A PCP owing £14,000, £6,000 of it the balloon, at its own 7.9%.
  const finance: Account = {
    balance: -14000,
    balloon: 6000,
    growth: { kind: "fixed", rate: 0.079 },
    id: 7,
    kind: "debt",
    name: "Golf PCP",
  };

  // A loan owing the same on the plan's 5%, with no balloon to leave.
  const loan: Account = {
    balance: -14000,
    growth: { kind: "plan" },
    id: 8,
    kind: "debt",
    name: "Car loan",
  };

  it("pays a debt down to its balloon at its own rate, or the plan's", () => {
    expect(debtTermOf(finance, 290, plan)).toBe(
      termOf({ balance: 14000, balloon: 6000 }, 290, 0.079),
    );
    expect(debtTermOf(loan, 290, plan)).toBe(
      termOf({ balance: 14000, balloon: 0 }, 290, 0.05),
    );
  });

  it("never pays off a debt whose interest swallows the payment", () => {
    expect(debtTermOf(finance, 50, plan)).toBeNull();
  });
});

describe("planOf", () => {
  // Four fifths at stocks' 7.95% and a fifth at bonds' 4.45%, with the
  // 2.95% typed for inflation; the balances read at the end of
  // September, so the plan opens in October.
  it("runs from the month after the one the balances are as of to the age given, for the owner, on the rates given as the savings are split", () => {
    expect(
      planOf(setting, { allocation, rates, rebalancing: 0 }),
    ).toStrictEqual({
      born: 1992,
      from: 2026,
      inflation: 0.0295,
      month: 9,
      owners,
      rate: planRate(rates, allocation, 0),
      retires: 61,
      years: 57,
    });
  });

  // The 7.25% the rates blend to and 0.4 of a point rebalancing earns.
  it("grows at the blend and what rebalancing earns over it", () => {
    expect(
      planOf(setting, { allocation, rates, rebalancing: 0.004 }).rate,
    ).toBeCloseTo(0.0765, 15);
  });

  // Balances read at the end of December open the plan in the January
  // after, so its first year is the new one, and it runs a year fewer
  // to the same age.
  it("opens the year after on balances as of December", () => {
    expect(
      planOf({ ...setting, asOf: { month: 11, year: 2026 } }, opening),
    ).toMatchObject({ from: 2027, month: 0, years: 56 });
  });

  // Sam, born in 1995, listed first: the plan is theirs, so it reaches
  // 91 three years later and retires when they do.
  it("is the first listed owner's, and nobody's, or one retiring with themselves, is refused", () => {
    expect(
      planOf(
        { ...setting, owners: [{ ...sam, retirement: atAge(67) }, ...owners] },
        opening,
      ),
    ).toMatchObject({ born: 1995, retires: 67, years: 60 });
    expect(() => planOf({ ...setting, owners: [] }, opening)).toThrow(
      "A plan is somebody's",
    );
    expect(() =>
      planOf(
        { ...setting, owners: [{ ...sam, retirement: "retirement" }] },
        opening,
      ),
    ).toThrow("Only someone else retires with the plan's owner");
  });

  // Twenty-five years of expenses, in liquid net worth, which no year of
  // the plan to 91 can say before a run reaches it.
  it("lays a retirement reached when conditions hold past the plan's end", () => {
    const retirement = [
      { measure: "liquid", of: "expenses", times: 25 },
    ] as const;

    expect(
      planOf({ ...setting, owners: [{ ...owners[0], retirement }] }, opening)
        .retires,
    ).toBe(92);
  });

  // A household that chose to draw its pension first carries the choice
  // onto its plan, and one that chose none names none, which draws the
  // savings first.
  it("carries the drawdown chosen, and names none where none was chosen", () => {
    expect(
      planOf({ ...setting, drawdown: "pension-first" }, opening).drawdown,
    ).toBe("pension-first");
    expect(planOf(setting, opening)).not.toHaveProperty("drawdown");
  });

  // Born in 1992, a plan to 28 has run its course by 2026, and runs no
  // years forward rather than a count below nothing.
  it("runs no years forward once its age is reached", () => {
    expect(planOf({ ...setting, ages: { ends: 28 } }, opening)).toMatchObject({
      from: 2026,
      years: 0,
    });
  });
});

describe("earnerOf", () => {
  it("reads the owner who earns a line off the plan, and refuses one the plan does not list in the rule's words", () => {
    const plan = planOf({ ...setting, owners: [...owners, sam] }, opening);

    expect(earnerOf({ owner: 2 }, plan)).toBe(sam);
    expect(() => earnerOf({ owner: 3 }, plan)).toThrow(
      "An income line is earned by an owner the plan lists",
    );
  });
});

describe("holderOf", () => {
  it("reads the owner a wrapper belongs to off the plan, and refuses one the plan does not list in the rule's words", () => {
    const plan = planOf({ ...setting, owners: [...owners, sam] }, opening);

    expect(holderOf({ owner: 2 }, plan)).toBe(sam);
    expect(() => holderOf({}, plan)).toThrow(
      "An ISA or a pension belongs to an owner the household lists",
    );
  });
});

describe("marginOf", () => {
  // A line rises nothing over prices with inflation, a point or two
  // over them for the choices that say so, and does not rise with them
  // at all fixed in nominal terms.
  it("reads each growth choice as its margin over prices", () => {
    expect(marginOf({ growth: "inflation" })).toBe(0);
    expect(marginOf({ growth: "inflation-plus-1" })).toBeCloseTo(0.01, 15);
    expect(marginOf({ growth: "inflation-plus-2" })).toBeCloseTo(0.02, 15);
    expect(marginOf({ growth: "nominal" })).toBeNull();
  });

  it("does not rise a line paying a loan with prices, whatever it says", () => {
    expect(marginOf({ growth: "inflation-plus-2", pays: 5 })).toBeNull();
  });
});

describe("inflationIn", () => {
  // A path from 2026 holds 2026 and 2027; the plan's 2% is taken before
  // it, past it, and for every year of a plan with none.
  it("reads a year's inflation off the path where it holds one, and the plan's own otherwise", () => {
    const plan = {
      from: 2026,
      inflation: 0.02,
      path: { inflation: [0.1, 0.2], rate: [0, 0] },
    };

    expect(inflationIn(plan, 2026)).toBeCloseTo(0.1, 15);
    expect(inflationIn(plan, 2027)).toBeCloseTo(0.2, 15);
    expect(inflationIn(plan, 2025)).toBeCloseTo(0.02, 15);
    expect(inflationIn(plan, 2028)).toBeCloseTo(0.02, 15);
    expect(inflationIn({ from: 2026, inflation: 0.02 }, 2026)).toBeCloseTo(
      0.02,
      15,
    );
  });
});

describe("rateIn", () => {
  // A path from 2026 holds 2026, a glide path 2026 and 2027; the path is
  // read over the glide path, and the plan's 5% before both, past both,
  // and for every year of a plan with neither.
  it("reads a year's rate off the path, the glide path's under it, and the plan's own otherwise", () => {
    const plan = {
      byYear: [0.07, 0.06],
      from: 2026,
      path: { inflation: [0], rate: [0.1] },
      rate: 0.05,
    };

    expect(rateIn(plan, 2026)).toBeCloseTo(0.1, 15);
    expect(rateIn(plan, 2027)).toBeCloseTo(0.06, 15);
    expect(rateIn(plan, 2025)).toBeCloseTo(0.05, 15);
    expect(rateIn(plan, 2028)).toBeCloseTo(0.05, 15);
    expect(rateIn({ from: 2026, rate: 0.05 }, 2026)).toBeCloseTo(0.05, 15);
  });
});

describe("pricesIn", () => {
  // At 10% from September 2026, prices stand where they are that month,
  // today's money, and have risen by a tenth the September after.
  it("reads how far prices have risen at the plan's inflation since the plan's first month", () => {
    const plan = { from: 2026, inflation: 0.1, month: 8 };

    expect(pricesIn(plan, { month: 8, year: 2026 })).toBe(1);
    expect(pricesIn(plan, { month: 8, year: 2027 })).toBeCloseTo(1.1, 12);
  });

  // Along a path of 10% in 2026 and 20% in 2027, by September 2027
  // prices have risen four months of the one and eight of the other.
  it("reads how far prices have risen along the plan's path", () => {
    const plan = {
      from: 2026,
      inflation: 0.02,
      month: 8,
      path: { inflation: [0.1, 0.2], rate: [0, 0] },
    };

    expect(pricesIn(plan, { month: 8, year: 2027 })).toBeCloseTo(
      1.1 ** (4 / 12) * 1.2 ** (8 / 12),
      12,
    );
  });
});

describe("risenBy", () => {
  // From September 2026, a rate has risen nothing that month, a whole
  // year's by the September after and half as much again, compounded,
  // six months on from that.
  it("compounds a rate a month at a time from the month the plan starts in", () => {
    const start = { from: 2026, month: 8 };

    expect(risenBy(0.1, start, { month: 8, year: 2026 })).toBe(1);
    expect(risenBy(0.1, start, { month: 8, year: 2027 })).toBeCloseTo(1.1, 12);
    expect(risenBy(0.1, start, { month: 2, year: 2028 })).toBeCloseTo(
      1.1 ** 1.5,
      12,
    );
  });
});

describe("risenWith", () => {
  // At 2% and a point over it, a sum has risen 3% a year on.
  it("compounds the plan's inflation and the margin together for a plan at its own rates", () => {
    const plan = { from: 2026, inflation: 0.02, month: 8 };

    expect(risenWith(0.01, plan, { month: 8, year: 2027 })).toBeCloseTo(
      1.03,
      12,
    );
  });

  // From September 2026 along 10% in 2026 and 20% in 2027, with a point
  // over each: nothing that month, four months at 11% by the new year,
  // eight more at 21% by the September after, and the whole of 2027 and
  // eight months of the plan's 2% and the point, past the path, by
  // September 2028.
  it("compounds each year's inflation along the plan's path, the margin over each, and the plan's own past it", () => {
    const plan = {
      from: 2026,
      inflation: 0.02,
      month: 8,
      path: { inflation: [0.1, 0.2], rate: [0, 0] },
    };

    expect(risenWith(0.01, plan, { month: 8, year: 2026 })).toBe(1);
    expect(risenWith(0.01, plan, { month: 0, year: 2027 })).toBeCloseTo(
      1.11 ** (4 / 12),
      12,
    );
    expect(risenWith(0.01, plan, { month: 8, year: 2027 })).toBeCloseTo(
      1.11 ** (4 / 12) * 1.21 ** (8 / 12),
      12,
    );
    expect(risenWith(0.01, plan, { month: 8, year: 2028 })).toBeCloseTo(
      1.11 ** (4 / 12) * 1.21 * 1.03 ** (8 / 12),
      12,
    );
  });

  // The years along the path are worked out once a plan and margin, so
  // a month read late in the plan first, and the plan read again at a
  // second margin, must each read what a plan asked nothing before does.
  it("reads the same along a path whatever was read of the plan before, at any margin", () => {
    const path = { inflation: [0.1, 0.2, 0.3], rate: [0, 0, 0] };
    const fresh = (): Parameters<typeof risenWith>[1] => ({
      from: 2026,
      inflation: 0.02,
      month: 8,
      path,
    });
    const plan = fresh();

    const late = risenWith(0.01, plan, { month: 3, year: 2028 });
    const early = risenWith(0.01, plan, { month: 3, year: 2027 });
    const level = risenWith(0, plan, { month: 3, year: 2028 });

    expect(late).toBe(risenWith(0.01, fresh(), { month: 3, year: 2028 }));
    expect(early).toBe(risenWith(0.01, fresh(), { month: 3, year: 2027 }));
    expect(level).toBe(risenWith(0, fresh(), { month: 3, year: 2028 }));
    expect(level).toBeCloseTo(1.1 ** (4 / 12) * 1.2 * 1.3 ** (3 / 12), 12);
  });

  // A year before the plan has risen nothing along its path, as it has
  // risen nothing at the plan's own rates before its first month.
  it("reads a year before the plan along a path as nothing risen", () => {
    const plan = {
      from: 2026,
      inflation: 0.02,
      month: 8,
      path: { inflation: [0.1], rate: [0] },
    };

    expect(risenWith(0.01, plan, { month: 11, year: 2025 })).toBe(1);
  });
});

describe("loggedSpread", () => {
  // A year straying 16% about 8% strays 14.58% in logs, and nothing
  // about anything strays by nothing.
  it("reads how far a year strays as its source states it as how far it strays in logs", () => {
    expect(loggedSpread(0.08, 0.16)).toBeCloseTo(0.1458034, 6);
    expect(loggedSpread(0.05, 0)).toBe(0);
  });
});

describe("statedSpread", () => {
  it("works a spread in logs back to the spread its source would state", () => {
    expect(statedSpread(0.08, loggedSpread(0.08, 0.16))).toBeCloseTo(0.16, 12);
    expect(statedSpread(0.05, 0)).toBe(0);
  });
});
