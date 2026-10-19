// @vitest-environment node
import { describe, expect, it } from "vitest";

import { sam } from "@/data/owners.fixture";

import {
  asPaid,
  contributionOf,
  isFeeding,
  isOpeningSound,
  matchOf,
  sacrificeOf,
  toPension,
  totalOf,
} from "./income";
import { incomeLines, retiring, statePension } from "./income.fixture";

const [salary, stepUp, consulting] = incomeLines;

// Retiring at 59, the owner retires in 2049, so 2048 is the last year
// a salary or a profit is paid in.
describe("asPaid", () => {
  it("stops a line earned by working at retirement, whatever its own end says", () => {
    const stopped = {
      endsAfter: 0,
      endsAt: "retirement",
      lastMonth: null,
      lastYear: 2048,
    };

    expect(asPaid({ ...salary, lastYear: null }, retiring)).toStrictEqual({
      ...salary,
      ...stopped,
    });
    expect(
      asPaid(
        {
          ...consulting,
          endsAfter: 2,
          endsAt: 1,
          firstYear: 2040,
          lastMonth: 5,
          lastYear: 2055,
        },
        retiring,
      ),
    ).toStrictEqual({ ...consulting, ...stopped, firstYear: 2040 });
  });

  // The consulting starts in 2049, the year the owner retires in, so it
  // is never paid, and keeps the ends it was given.
  it("runs a line earned from retirement on no years, tied as it was", () => {
    expect(asPaid({ ...consulting, endsAt: 1 }, retiring)).toStrictEqual({
      ...consulting,
      endsAt: 1,
      lastMonth: null,
      lastYear: 2048,
    });
  });

  it("hands back as it is a line ending before retirement, and one not earned", () => {
    const ending = { ...salary, lastMonth: 5, lastYear: 2048 };

    expect(asPaid(ending, retiring)).toBe(ending);
    expect(asPaid(statePension, retiring)).toBe(statePension);
  });

  // Sam, born in 1993 and retiring at 59, retires in 2052, three years
  // after the plan's owner, so a salary of Sam's running with the plan
  // is paid to 2051 and ends in a fixed year, since Retirement is the
  // plan's owner's milestone; born in 1990 like them, Sam's ends at it.
  it("stops a line at its own owner's retirement, tied to Retirement only where that is the milestone's year", () => {
    const theirs = { ...salary, lastYear: null, owner: sam.id };
    const shared = { ...retiring, owners: [...retiring.owners, sam] };

    expect(asPaid(theirs, shared)).toStrictEqual({
      ...theirs,
      endsAfter: 0,
      endsAt: null,
      lastMonth: null,
      lastYear: 2051,
    });
    expect(
      asPaid(theirs, {
        ...retiring,
        owners: [...retiring.owners, { ...sam, born: 1990 }],
      }),
    ).toMatchObject({ endsAt: "retirement", lastYear: 2048 });
  });
});

describe("totalOf", () => {
  it("sums an employment line's base, bonus and RSUs, and leaves another line's amount as it is", () => {
    expect(totalOf(salary)).toBe(147000);
    expect(totalOf(statePension)).toBe(12548);
  });
});

describe("sacrificeOf", () => {
  // A tenth of the £120,000 base, and none of the bonus or the RSUs.
  it("takes the share of the base alone, and nothing from a line giving up none", () => {
    expect(sacrificeOf(salary)).toBe(12000);
    expect(sacrificeOf(stepUp)).toBe(0);
    expect(sacrificeOf(statePension)).toBe(0);
  });
});

describe("matchOf", () => {
  // Seven per cent of the £120,000 base, £8,400, matched pound for pound
  // with the tenth given up; a fifth is matched only as far as that
  // tenth, £12,000; and a line giving up nothing is matched nothing,
  // however much its employer would match.
  it("pays pound for pound with the sacrifice up to the share matched, of the base alone", () => {
    expect(matchOf({ ...salary, match: 0.07 })).toBeCloseTo(8400, 8);
    expect(matchOf({ ...salary, match: 0.2 })).toBe(12000);
    expect(matchOf(salary)).toBe(0);
    expect(matchOf({ ...stepUp, match: 0.07 })).toBe(0);
  });

  // The owner's own scheme, matched to seven per cent of the £120,000
  // base and floored at three: 2% given up is paid the floor, £3,600;
  // 5% is matched, £6,000; a tenth is matched only to seven per cent,
  // £8,400; a line giving up nothing is paid the floor all the same;
  // and a floor of nothing pays what no floor does.
  it("pays the floor where the match falls short of it, whatever is given up", () => {
    const scheme = { ...salary, floor: 0.03, match: 0.07 };

    expect(matchOf({ ...scheme, sacrifice: 0.02 })).toBeCloseTo(3600, 8);
    expect(matchOf({ ...scheme, sacrifice: 0.05 })).toBeCloseTo(6000, 8);
    expect(matchOf(scheme)).toBeCloseTo(8400, 8);
    expect(matchOf({ ...scheme, sacrifice: 0 })).toBeCloseTo(3600, 8);
    expect(matchOf({ ...salary, floor: 0, match: 0.07 })).toBeCloseTo(8400, 8);
  });
});

describe("contributionOf", () => {
  // The £12,000 sacrificed and the employer's fifteen per cent NI saved
  // on it, £1,800, land together, and the employer's £8,400 match
  // beside them where the salary is matched to seven per cent.
  it("pays the sacrifice into the pension with the employer's NI saved on it, and the match", () => {
    expect(contributionOf(salary)).toBeCloseTo(13800, 8);
    expect(contributionOf({ ...salary, match: 0.07 })).toBeCloseTo(22200, 8);
    expect(contributionOf(stepUp)).toBe(0);
  });

  // Floored at three per cent, 2% given up lands its £2,400 with £360 of
  // NI and the employer's £3,600, and nothing given up lands the £3,600
  // alone.
  it("pays the employer's floor beside what is given up, and alone where nothing is", () => {
    const scheme = { ...salary, floor: 0.03, match: 0.07 };

    expect(contributionOf({ ...scheme, sacrifice: 0.02 })).toBeCloseTo(6360, 8);
    expect(contributionOf({ ...scheme, sacrifice: 0 })).toBeCloseTo(3600, 8);
  });
});

// The salary as its dialog holds it, feeding the pension it opened on
// and opening none, and the same salary opening one instead.
const feeding = { ...salary, opens: null };
const opening = {
  ...salary,
  feeds: null,
  opens: { balance: 2500, name: "Aviva", owner: 1 },
};

describe("isFeeding", () => {
  it("says whether the line has a pension to sacrifice into, listed or opened", () => {
    expect(isFeeding(feeding)).toBe(true);
    expect(isFeeding(opening)).toBe(true);
    expect(isFeeding({ ...feeding, feeds: null })).toBe(false);
  });
});

describe("isOpeningSound", () => {
  it("holds a pension the line opens to being named and owned, and asks nothing of a line opening none", () => {
    expect(isOpeningSound(opening)).toBe(true);
    expect(isOpeningSound(feeding)).toBe(true);
    expect(
      isOpeningSound({
        ...opening,
        opens: { balance: 0, name: "  ", owner: 1 },
      }),
    ).toBe(false);
    expect(
      isOpeningSound({
        ...opening,
        opens: { balance: 0, name: "Aviva", owner: null },
      }),
    ).toBe(false);
  });
});

describe("toPension", () => {
  it("writes the pension as a wrapper paid before tax, at the plan rate, paid nothing of its own, for its owner", () => {
    expect(toPension({ balance: 2500, name: "Aviva", owner: 1 })).toStrictEqual(
      {
        balance: 2500,
        balloon: 0,
        cadence: "year",
        cap: 0,
        contribution: 0,
        funding: "fixed",
        growth: "plan",
        isAlwaysFunded: false,
        kind: "tax-deferred",
        name: "Aviva",
        owner: 1,
        rate: 0,
      },
    );
  });
});
