// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  asPaid,
  contributionOf,
  isFeeding,
  isOpeningSound,
  sacrificeOf,
  toPension,
  totalOf,
} from "./income";
import { incomeLines, retiring } from "./income.fixture";

const [salary, stepUp, consulting, statePension] = incomeLines;

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
});

describe("totalOf", () => {
  it("sums an employment line's base, bonus and RSUs, and leaves another line's amount as it is", () => {
    expect(totalOf(salary)).toBe(147000);
    expect(totalOf(statePension)).toBe(23400);
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

describe("contributionOf", () => {
  // The £12,000 sacrificed and the employer's fifteen per cent NI saved
  // on it, £1,800, land together.
  it("pays the sacrifice into the pension with the employer's NI saved on it", () => {
    expect(contributionOf(salary)).toBeCloseTo(13800, 8);
    expect(contributionOf(stepUp)).toBe(0);
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
