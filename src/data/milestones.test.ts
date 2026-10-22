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

// A sabbatical at 59, the age the owner retires at.
const sabbatical = { conditions: atAge(59), id: 5, name: "Sabbatical" };

// A year worth a million, half of it the house, spending £30,000 and
// owing £40,000, at 36.
const year: Measured = {
  age: 36,
  debt: 40000,
  expenses: 30000,
  liquid: 500000,
  worth: 1000000,
};

describe("ageOf", () => {
  it("reads the age a milestone reached at an age is reached at, and none for one reached when conditions hold", () => {
    expect(ageOf(kidsLeave)).toBe(46);
    expect(ageOf(firstMillion)).toBeUndefined();
    expect(
      ageOf({ conditions: [...atAge(46), ...firstMillion.conditions] }),
    ).toBeUndefined();
    expect(ageOf({ conditions: [] })).toBeUndefined();
  });
});

describe("atAge", () => {
  it("is the one condition, on the age", () => {
    expect(atAge(46)).toStrictEqual([
      { measure: "age", of: "years", times: 46 },
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
      "Age ≥ 46 years",
    ]);
  });
});

describe("isReached", () => {
  it("is reached once the measure is at least the multiple of its basis, and not short of it", () => {
    expect(isReached(firstMillion, year)).toBe(true);
    expect(isReached(firstMillion, { ...year, worth: 999999 })).toBe(false);
  });

  it("is reached at an age as at a sum of pounds, a year being a unit of its own", () => {
    expect(isReached({ conditions: atAge(36) }, year)).toBe(true);
    expect(isReached({ conditions: atAge(37) }, year)).toBe(false);
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
      { id: 7, name: "Kids leave home", year: 2036 },
      { id: "retirement", name: "Retirement", year: 2049 },
      { id: 8, name: "Downsize", year: 2055 },
    ]);
  });

  it("has retirement alone for a household listing none, and first of two in its year", () => {
    const retirement = { id: "retirement", name: "Retirement", year: 2049 };

    expect(markersOf([], retiring)).toStrictEqual([retirement]);
    expect(markersOf([sabbatical], retiring)).toStrictEqual([
      retirement,
      { id: 5, name: "Sabbatical", year: 2049 },
    ]);
  });

  it("leaves out retirement reached when conditions hold, which only a run of the plan places", () => {
    expect(
      markersOf([kidsLeave], {
        ...retiring,
        owners: [{ ...owners[0], retirement: independence.conditions }],
      }),
    ).toStrictEqual([{ id: 7, name: "Kids leave home", year: 2036 }]);
  });
});

describe("isTiedTo", () => {
  it("says whether either end of a line is tied to the milestone", () => {
    expect(isTiedTo({ ...salary, endsAt: "retirement" }, "retirement")).toBe(
      true,
    );
    expect(isTiedTo({ ...salary, startsAt: 7 }, 7)).toBe(true);
    expect(isTiedTo({ ...salary, startsAt: 7 }, 8)).toBe(false);
    expect(isTiedTo(salary, "retirement")).toBe(false);
  });
});

describe("moving", () => {
  // The children leave home at 46, in 2036, wherever the move was saved.
  it("reads a move's year off the milestone it is at", () => {
    expect(
      moving({ ...house, move: { ...move, year: 2040 } }, milestones, retiring),
    ).toStrictEqual({ ...house, move });
  });

  it("leaves an account with no move as it is, and one moving at a milestone the household does not list or reached when conditions hold", () => {
    const [cash] = accounts;
    const unlisted = { ...house, move: { ...move, at: 99 } };
    const conditional = { ...house, move: { ...move, at: 9 } };

    expect(moving(cash, milestones, retiring)).toBe(cash);
    expect(moving(unlisted, milestones, retiring)).toBe(unlisted);
    expect(moving(conditional, milestones, retiring)).toBe(conditional);
  });
});

describe("retiresOn", () => {
  it("reads what the plan's owner retires on where it is conditions, and nothing where it is an age, with themselves, or there is no owner", () => {
    expect(
      retiresOn({
        owners: [{ ...owners[0], retirement: independence.conditions }],
      }),
    ).toStrictEqual(independence.conditions);
    expect(retiresOn(retiring)).toBeUndefined();
    expect(
      retiresOn({ owners: [{ ...owners[0], retirement: "retirement" }] }),
    ).toBeUndefined();
    expect(retiresOn({ owners: [] })).toBeUndefined();
  });
});

describe("retirementYearOf", () => {
  // Retiring at 59 the owner retires in 2049, and Sam, born three years
  // later, in 2052. The plan's owner retiring on financial independence
  // retires where the plan lays it, which for a plan to 89 is past its
  // end until a run says otherwise.
  it("reads an age off an owner's retirement, and the plan's year for its owner retiring when conditions hold, refusing anyone else's", () => {
    const plan = { ...retiring, owners: [owners[0], sam] };
    const onConditions = independence.conditions;

    expect(retirementYearOf(owners[0], plan)).toBe(2049);
    expect(retirementYearOf(sam, plan)).toBe(2052);
    expect(
      retirementYearOf(
        { ...owners[0], retirement: onConditions },
        { ...plan, retires: 90 },
      ),
    ).toBe(2080);
    expect(() =>
      retirementYearOf({ ...sam, retirement: onConditions }, plan),
    ).toThrow("Only the plan's owner retires when conditions hold");
  });

  // Sam retires with the plan's owner: in 2049 where the owner retires
  // at 59, and past the end of a plan to 89 where they retire on
  // financial independence, until a run says otherwise.
  it("reads the plan's year for anyone retiring with its owner, refusing its owner retiring with themselves", () => {
    const withSam = { ...sam, retirement: "retirement" } as const;
    const plan = { ...retiring, owners: [owners[0], withSam] };

    expect(retirementYearOf(withSam, plan)).toBe(2049);
    expect(retirementYearOf(withSam, { ...plan, retires: 90 })).toBe(2080);
    expect(() =>
      retirementYearOf(
        { ...owners[0], retirement: "retirement" },
        { ...plan, owners: [{ ...owners[0], retirement: "retirement" }] },
      ),
    ).toThrow("Only someone else retires with the plan's owner");
  });
});

describe("retiringAt", () => {
  it("moves the plan's retirement age and its owner's together, leaving the rest", () => {
    const plan = { ...retiring, owners: [owners[0], sam] };

    expect(retiringAt(plan, 65)).toStrictEqual({
      ...plan,
      owners: [{ ...owners[0], retirement: atAge(65) }, sam],
      retires: 65,
    });
  });
});

describe("timed", () => {
  // Retirement at 59 falls in 2049, so a line ending at it runs the
  // whole of 2048 and one starting at it starts in 2049; the children
  // leave home at 46, in 2036.
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
      lastYear: 2048,
    });
    expect(
      timed({ ...salary, firstYear: 2030, startsAt: 7 }, milestones, retiring),
    ).toStrictEqual({ ...salary, firstYear: 2036, startsAt: 7 });
  });

  // Three years after retirement in 2049 is the end of 2051.
  it("runs an end tied some years after its milestone the whole of the last of them", () => {
    expect(
      timed(
        { ...salary, endsAfter: 3, endsAt: "retirement" },
        milestones,
        retiring,
      ),
    ).toMatchObject({ endsAfter: 3, lastMonth: null, lastYear: 2051 });
  });

  it("leaves an end tied to none as it is, and one tied to a milestone the household does not list or reached when conditions hold", () => {
    expect(timed(salary, milestones, retiring)).toStrictEqual(salary);
    expect(
      timed({ ...salary, endsAt: 99, startsAt: 99 }, milestones, retiring),
    ).toStrictEqual({ ...salary, endsAt: 99, startsAt: 99 });
    expect(
      timed({ ...salary, endsAt: 10, startsAt: 9 }, milestones, retiring),
    ).toStrictEqual({ ...salary, endsAt: 10, startsAt: 9 });
  });
});

describe("untied", () => {
  it("fixes each end tied to the milestone in the year it falls in now, and leaves the rest tied", () => {
    expect(
      untied(
        { ...salary, endsAt: 8, firstYear: 2036, lastYear: 2054, startsAt: 7 },
        kidsLeave,
        retiring,
      ),
    ).toStrictEqual({
      ...salary,
      endsAt: 8,
      firstYear: 2036,
      lastYear: 2054,
      startsAt: null,
    });
    expect(
      untied(
        { ...salary, endsAt: 8, lastMonth: 3, lastYear: 2060 },
        downsize,
        retiring,
      ),
    ).toStrictEqual({
      ...salary,
      endsAt: null,
      lastMonth: null,
      lastYear: 2054,
    });
    expect(
      untied({ ...salary, endsAfter: 3, endsAt: 8 }, downsize, retiring),
    ).toStrictEqual({
      ...salary,
      endsAfter: 0,
      endsAt: null,
      lastMonth: null,
      lastYear: 2057,
    });
    expect(untied(salary, downsize, retiring)).toStrictEqual(salary);
  });

  // Nothing is tied to a milestone reached when conditions hold, and
  // it has no year to fix an end in.
  it("leaves every line as it is for a milestone reached when conditions hold", () => {
    const tied = { ...salary, startsAt: 9 };

    expect(untied(tied, firstMillion, retiring)).toBe(tied);
  });
});

describe("yearsOf", () => {
  // Retiring at 59, the owner retires in 2049; a sabbatical that year
  // shares its rule.
  it("gives each milestone's year once, in the order they come", () => {
    expect(
      yearsOf(markersOf([...milestones, sabbatical], retiring)),
    ).toStrictEqual([2036, 2049, 2055]);
  });
});
