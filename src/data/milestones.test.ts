// @vitest-environment node
import { describe, expect, it } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { house, move } from "@/data/houses.fixture";
import { incomeLines, retiring } from "@/data/income.fixture";
import { owners, sam } from "@/data/owners.fixture";

import type { Measured } from "./milestones";

import {
  ageOf,
  atAge,
  conditionOf,
  isReached,
  isTiedTo,
  markersOf,
  moving,
  retirementYearOf,
  retiresOn,
  retiringAt,
  timed,
  untied,
  yearsOf,
} from "./milestones";
import { milestones } from "./milestones.fixture";

const [kidsLeave, downsize, firstMillion, independence] = milestones;
const [salary] = incomeLines;

// A sabbatical at 61, the age the owner retires at.
const sabbatical = { conditions: atAge(61), id: 5, name: "Sabbatical" };

// A year worth a million, half of it the house, spending £30,000 and
// owing £40,000, at 34.
const year: Measured = {
  age: 34,
  debt: 40000,
  expenses: 30000,
  liquid: 500000,
  worth: 1000000,
};

describe("ageOf", () => {
  it("reads the age a milestone reached at an age is reached at, and none for one reached when conditions hold", () => {
    expect(ageOf(kidsLeave)).toBe(48);
    expect(ageOf(firstMillion)).toBeUndefined();
    expect(
      ageOf({ conditions: [...atAge(48), ...firstMillion.conditions] }),
    ).toBeUndefined();
    expect(ageOf({ conditions: [] })).toBeUndefined();
  });
});

describe("atAge", () => {
  it("is the one condition, on the age", () => {
    expect(atAge(48)).toStrictEqual([
      { measure: "age", of: "years", times: 48 },
    ]);
  });
});

describe("conditionOf", () => {
  it("says a condition in words, a sum of pounds formatted, a multiple of a measure named and an age in years", () => {
    expect(firstMillion.conditions.map(conditionOf)).toStrictEqual([
      "Net worth ≥ £1,000,000",
    ]);
    expect(independence.conditions.map(conditionOf)).toStrictEqual([
      "Liquid net worth ≥ 25 years of expenses",
      "Liquid net worth ≥ 10 times the debt",
    ]);
    expect(
      conditionOf({ measure: "expenses", of: "worth", times: 0.025 }),
    ).toBe("A year's expenses ≥ 0.03 times net worth");
    expect(kidsLeave.conditions.map(conditionOf)).toStrictEqual([
      "Age ≥ 48 years",
    ]);
  });
});

describe("isReached", () => {
  it("is reached once the measure is at least the multiple of its basis, and not short of it", () => {
    expect(isReached(firstMillion, year)).toBe(true);
    expect(isReached(firstMillion, { ...year, worth: 999999 })).toBe(false);
  });

  it("is reached at an age as at a sum of pounds, a year being a unit of its own", () => {
    expect(isReached({ conditions: atAge(34) }, year)).toBe(true);
    expect(isReached({ conditions: atAge(35) }, year)).toBe(false);
  });

  // £500,000 is 25 years of £20,000 and ten times £40,000 owed, and no
  // more than either.
  it("is reached only once every condition holds", () => {
    expect(isReached(independence, { ...year, expenses: 20000 })).toBe(true);
    expect(isReached(independence, year)).toBe(false);
    expect(
      isReached(independence, { ...year, debt: 50001, expenses: 20000 }),
    ).toBe(false);
  });

  it("is reached at once by a milestone holding no condition", () => {
    expect(isReached({ conditions: [] }, year)).toBe(true);
  });
});

describe("markersOf", () => {
  it("lays the milestones reached at an age out in the order their years come, retirement among them in the year it falls, and leaves out those reached when conditions hold", () => {
    expect(
      markersOf([downsize, firstMillion, kidsLeave, independence], retiring),
    ).toStrictEqual([
      { id: 1, name: "Kids leave home", year: 2040 },
      { id: "retirement", name: "Retirement", year: 2053 },
      { id: 2, name: "Downsize", year: 2059 },
    ]);
  });

  it("has retirement alone for a household listing none, and first of two in its year", () => {
    const retirement = { id: "retirement", name: "Retirement", year: 2053 };

    expect(markersOf([], retiring)).toStrictEqual([retirement]);
    expect(markersOf([sabbatical], retiring)).toStrictEqual([
      retirement,
      { id: 5, name: "Sabbatical", year: 2053 },
    ]);
  });

  it("leaves out retirement reached when conditions hold, which only a run of the plan places", () => {
    expect(
      markersOf([kidsLeave], {
        ...retiring,
        owners: [{ ...owners[0], retirement: independence.conditions }],
      }),
    ).toStrictEqual([{ id: 1, name: "Kids leave home", year: 2040 }]);
  });
});

describe("isTiedTo", () => {
  it("says whether either end of a line is tied to the milestone", () => {
    expect(isTiedTo({ ...salary, endsAt: "retirement" }, "retirement")).toBe(
      true,
    );
    expect(isTiedTo({ ...salary, startsAt: 1 }, 1)).toBe(true);
    expect(isTiedTo({ ...salary, startsAt: 1 }, 2)).toBe(false);
    expect(isTiedTo(salary, "retirement")).toBe(false);
  });
});

describe("moving", () => {
  // The children leave home at 48, in 2040, wherever the move was saved.
  it("reads a move's year off the milestone it is at", () => {
    expect(
      moving({ ...house, move: { ...move, year: 2044 } }, milestones, retiring),
    ).toStrictEqual({ ...house, move });
  });

  it("leaves an account with no move as it is, and one moving at a milestone the household does not list or reached when conditions hold", () => {
    const [cash] = accounts;
    const unlisted = { ...house, move: { ...move, at: 99 } };
    const conditional = { ...house, move: { ...move, at: 3 } };

    expect(moving(cash, milestones, retiring)).toBe(cash);
    expect(moving(unlisted, milestones, retiring)).toBe(unlisted);
    expect(moving(conditional, milestones, retiring)).toBe(conditional);
  });
});

describe("retiresOn", () => {
  it("reads what the plan's owner retires on where it is conditions, and nothing where it is an age or there is no owner", () => {
    expect(
      retiresOn({
        owners: [{ ...owners[0], retirement: independence.conditions }],
      }),
    ).toStrictEqual(independence.conditions);
    expect(retiresOn(retiring)).toBeUndefined();
    expect(retiresOn({ owners: [] })).toBeUndefined();
  });
});

describe("retirementYearOf", () => {
  // Retiring at 61 the owner retires in 2053, and Sam, born three years
  // later, in 2056. The plan's owner retiring on financial independence
  // retires where the plan lays it, which for a plan to 91 is past its
  // end until a run says otherwise.
  it("reads an age off an owner's retirement, and the plan's year for its owner retiring when conditions hold, refusing anyone else's", () => {
    const plan = { ...retiring, owners: [owners[0], sam] };
    const onConditions = independence.conditions;

    expect(retirementYearOf(owners[0], plan)).toBe(2053);
    expect(retirementYearOf(sam, plan)).toBe(2056);
    expect(
      retirementYearOf(
        { ...owners[0], retirement: onConditions },
        { ...plan, retires: 92 },
      ),
    ).toBe(2084);
    expect(() =>
      retirementYearOf({ ...sam, retirement: onConditions }, plan),
    ).toThrow("Only the plan's owner retires when conditions hold");
  });
});

describe("retiringAt", () => {
  it("moves the plan's retirement age and its owner's together, leaving the rest", () => {
    const plan = { ...retiring, owners: [owners[0], sam] };

    expect(retiringAt(plan, 67)).toStrictEqual({
      ...plan,
      owners: [{ ...owners[0], retirement: atAge(67) }, sam],
      retires: 67,
    });
  });
});

describe("timed", () => {
  // Retirement at 61 falls in 2053, so a line ending at it runs the
  // whole of 2052 and one starting at it starts in 2053; the children
  // leave home at 48, in 2040.
  it("reads a tied end off its milestone, starting in its year or running the whole of the year before", () => {
    expect(
      timed(
        { ...salary, endsAt: "retirement", lastMonth: 5, lastYear: 2060 },
        milestones,
        retiring,
      ),
    ).toStrictEqual({
      ...salary,
      endsAt: "retirement",
      lastMonth: null,
      lastYear: 2052,
    });
    expect(
      timed({ ...salary, firstYear: 2030, startsAt: 1 }, milestones, retiring),
    ).toStrictEqual({ ...salary, firstYear: 2040, startsAt: 1 });
  });

  // Three years after retirement in 2053 is the end of 2055.
  it("runs an end tied some years after its milestone the whole of the last of them", () => {
    expect(
      timed(
        { ...salary, endsAfter: 3, endsAt: "retirement" },
        milestones,
        retiring,
      ),
    ).toMatchObject({ endsAfter: 3, lastMonth: null, lastYear: 2055 });
  });

  it("leaves an end tied to none as it is, and one tied to a milestone the household does not list or reached when conditions hold", () => {
    expect(timed(salary, milestones, retiring)).toStrictEqual(salary);
    expect(
      timed({ ...salary, endsAt: 99, startsAt: 99 }, milestones, retiring),
    ).toStrictEqual({ ...salary, endsAt: 99, startsAt: 99 });
    expect(
      timed({ ...salary, endsAt: 4, startsAt: 3 }, milestones, retiring),
    ).toStrictEqual({ ...salary, endsAt: 4, startsAt: 3 });
  });
});

describe("untied", () => {
  it("fixes each end tied to the milestone in the year it falls in now, and leaves the rest tied", () => {
    expect(
      untied(
        { ...salary, endsAt: 2, firstYear: 2040, lastYear: 2058, startsAt: 1 },
        kidsLeave,
        retiring,
      ),
    ).toStrictEqual({
      ...salary,
      endsAt: 2,
      firstYear: 2040,
      lastYear: 2058,
      startsAt: null,
    });
    expect(
      untied(
        { ...salary, endsAt: 2, lastMonth: 3, lastYear: 2060 },
        downsize,
        retiring,
      ),
    ).toStrictEqual({
      ...salary,
      endsAt: null,
      lastMonth: null,
      lastYear: 2058,
    });
    expect(
      untied({ ...salary, endsAfter: 3, endsAt: 2 }, downsize, retiring),
    ).toStrictEqual({
      ...salary,
      endsAfter: 0,
      endsAt: null,
      lastMonth: null,
      lastYear: 2061,
    });
    expect(untied(salary, downsize, retiring)).toStrictEqual(salary);
  });

  // Nothing is tied to a milestone reached when conditions hold, and
  // it has no year to fix an end in.
  it("leaves every line as it is for a milestone reached when conditions hold", () => {
    const tied = { ...salary, startsAt: 3 };

    expect(untied(tied, firstMillion, retiring)).toBe(tied);
  });
});

describe("yearsOf", () => {
  // Retiring at 61, the owner retires in 2053; a sabbatical that year
  // shares its rule.
  it("gives each milestone's year once, in the order they come", () => {
    expect(
      yearsOf(markersOf([...milestones, sabbatical], retiring)),
    ).toStrictEqual([2040, 2053, 2059]);
  });
});
