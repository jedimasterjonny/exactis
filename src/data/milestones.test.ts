// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { Owner } from "@/data/owners";
import type { Plan } from "@/data/plan";

import { accounts } from "@/data/accounts.fixture";
import { children } from "@/data/children.fixture";
import { house, move } from "@/data/houses.fixture";
import { incomeLines, retiring } from "@/data/income.fixture";
import { owners, sam } from "@/data/owners.fixture";

import type { Condition, Measured } from "./milestones";

import {
  ageOf,
  atAge,
  bornIn,
  conditionOf,
  conditionsOf,
  isMeasuredOn,
  isReached,
  isTiedTo,
  markersOf,
  moving,
  retirementYearOf,
  retiresBy,
  retiresOn,
  retiringAt,
  timed,
  untied,
  yearOf,
  yearsOf,
} from "./milestones";
import { milestones } from "./milestones.fixture";

const [kidsLeave, downsize, firstMillion, independence] = milestones;
const [salary] = incomeLines;

// A sabbatical at 61, the age the owner retires at.
const sabbatical = { conditions: atAge(61), id: 5, name: "Sabbatical" };

const [ada, finn, cleo] = children;

// The plan carrying Sam, born in 1995, beside its owner, born in 1992,
// and the three children, born in 2015, 2016 and 2028.
const raising: Plan = {
  ...retiring,
  children,
  owners: [...retiring.owners, sam],
};

// Ada at 18, which she reaches in 2033.
const adaAt18 = { conditions: atAge(18, ada.id), id: 11, name: "Ada at 18" };

// A year worth a million, half of it the house, spending £30,000 and
// owing £40,000 on a debt no expense line pays, at 34.
const year: Measured = {
  age: 34,
  debt: 40000,
  expenses: 30000,
  liquid: 500000,
  loans: 0,
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
  it("is the one condition, on the age, the plan's owner's or that of whoever the id names", () => {
    expect(atAge(48)).toStrictEqual([
      { measure: "age", of: "years", times: 48 },
    ]);
    expect(atAge(18, 20)).toStrictEqual([
      { measure: "age", of: "years", times: 18, whose: 20 },
    ]);
  });
});

describe("bornIn", () => {
  it("reads the year born of the plan's owner for none, of an owner, or of a child, and none for an id the plan carries nobody under", () => {
    expect(bornIn(raising, undefined)).toBe(1992);
    expect(bornIn(raising, sam.id)).toBe(1995);
    expect(bornIn(raising, cleo.id)).toBe(2028);
    expect(bornIn(raising, 99)).toBeUndefined();
    expect(bornIn(retiring, ada.id)).toBeUndefined();
  });
});

describe("isMeasuredOn", () => {
  it("says whether a milestone is reached at the age of whoever the id names", () => {
    expect(isMeasuredOn(adaAt18, ada.id)).toBe(true);
    expect(isMeasuredOn(adaAt18, finn.id)).toBe(false);
    expect(isMeasuredOn(kidsLeave, owners[0].id)).toBe(false);
  });
});

describe("yearOf", () => {
  // The plan's owner reaches 48 in 2040 and Sam in 2043; Ada, born in
  // March 2015, reaches 18 in 2033, and Finn, born in October 2016, 19
  // in 2035, the month born read nowhere.
  it("reads the year whoever's age a milestone is reached at reaches it, the plan's owner's where it names nobody", () => {
    expect(yearOf(kidsLeave, raising)).toBe(2040);
    expect(yearOf({ conditions: atAge(48, sam.id) }, raising)).toBe(2043);
    expect(yearOf(adaAt18, raising)).toBe(2033);
    expect(yearOf({ conditions: atAge(19, finn.id) }, raising)).toBe(2035);
  });

  it("reads none for a milestone reached when conditions hold, or one measured on someone the plan does not carry", () => {
    expect(yearOf(firstMillion, raising)).toBeUndefined();
    expect(yearOf(adaAt18, retiring)).toBeUndefined();
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

describe("conditionsOf", () => {
  it("says conditions in words, each as conditionOf says it, between dots", () => {
    expect(
      conditionsOf([
        { measure: "worth", of: "pounds", times: 1000000 },
        { measure: "liquid", of: "debt", times: 10 },
      ]),
    ).toBe("Net worth ≥ £1,000,000 · Liquid net worth ≥ 10 times the debt");
  });

  it("says the age a retirement on conditions comes by as that, and no floor", () => {
    expect(
      conditionsOf([
        { measure: "liquid", of: "expenses", times: 25 },
        ...atAge(60),
      ]),
    ).toBe("Liquid net worth ≥ 25 years of expenses · Or by age 60");
  });

  // A milestone reached at an age is described by its condition where
  // the plan carries nobody it is measured on, and an age alone is no
  // age a retirement comes by.
  it("says an age standing alone as conditionOf says it", () => {
    expect(conditionsOf(atAge(18))).toBe("Age ≥ 18 years");
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

  // The £40,000 owed is on a loan an expense line pays, so the year's
  // £21,600 of expenses carries its payments. Against the expenses the
  // worths count it back, £540,000 liquid, 25 years of them, and
  // £1,040,000 in all, 48 years and more, and the expenses are 4% of the
  // £540,000 and no more; against pounds or the debt £500,000 is read
  // as it is, short of £540,000 and of 13 times what is owed.
  it("adds the loans the lines pay back to a worth set against the expenses, and nowhere else", () => {
    const owing = { ...year, expenses: 21600, loans: 40000 };
    const isHeld = (condition: Condition, measured = owing): boolean =>
      isReached({ conditions: [condition] }, measured);

    expect(isHeld({ measure: "liquid", of: "expenses", times: 25 })).toBe(true);
    expect(
      isHeld(
        { measure: "liquid", of: "expenses", times: 25 },
        { ...owing, loans: 39999 },
      ),
    ).toBe(false);
    expect(isHeld({ measure: "worth", of: "expenses", times: 48 })).toBe(true);
    expect(isHeld({ measure: "expenses", of: "liquid", times: 0.04 })).toBe(
      true,
    );
    expect(
      isHeld(
        { measure: "expenses", of: "liquid", times: 0.04 },
        { ...owing, loans: 40001 },
      ),
    ).toBe(false);
    expect(isHeld({ measure: "liquid", of: "pounds", times: 540000 })).toBe(
      false,
    );
    expect(isHeld({ measure: "liquid", of: "debt", times: 13 })).toBe(false);
  });
});

describe("markersOf", () => {
  it("lays the milestones reached at an age out in the order their years come, retirement among them in the year it falls, and leaves out those reached when conditions hold", () => {
    expect(
      markersOf([downsize, firstMillion, kidsLeave, independence], retiring),
    ).toStrictEqual([
      { id: 7, name: "Kids leave home", year: 2040 },
      { id: "retirement", name: "Retirement", year: 2053 },
      { id: 8, name: "Downsize", year: 2059 },
    ]);
  });

  // Ada reaches 18 in 2033, before the children leave home at the plan's
  // owner's 48.
  it("lays a milestone reached at someone else's age out in the year they reach it", () => {
    expect(markersOf([kidsLeave, adaAt18], raising)).toStrictEqual([
      { id: 11, name: "Ada at 18", year: 2033 },
      { id: 7, name: "Kids leave home", year: 2040 },
      { id: "retirement", name: "Retirement", year: 2053 },
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
    ).toStrictEqual([{ id: 7, name: "Kids leave home", year: 2040 }]);
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
  // The children leave home at 48, in 2040, wherever the move was saved.
  it("reads a move's year off the milestone it is at", () => {
    expect(
      moving({ ...house, move: { ...move, year: 2044 } }, milestones, retiring),
    ).toStrictEqual({ ...house, move });
  });

  // Ada reaches 18 in 2033.
  it("reads the year of a move at someone else's age off theirs", () => {
    expect(
      moving(
        { ...house, move: { ...move, at: adaAt18.id } },
        [adaAt18],
        raising,
      ),
    ).toStrictEqual({
      ...house,
      move: { ...move, at: adaAt18.id, year: 2033 },
    });
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

describe("retiresBy", () => {
  // Retiring on twenty-five years of expenses, or by 60.
  it("reads the age the plan's owner retiring on conditions retires by, and nothing where they hold none, retire at an age, with themselves, or there is no owner", () => {
    const [sum] = independence.conditions;
    const retiringOn = (
      retirement: Owner["retirement"],
    ): Pick<Plan, "owners"> => ({ owners: [{ ...owners[0], retirement }] });

    expect(retiresBy(retiringOn([sum, ...atAge(60)]))).toBe(60);
    expect(retiresBy(retiringOn([sum]))).toBeUndefined();
    expect(retiresBy(retiringOn(atAge(60)))).toBeUndefined();
    expect(retiresBy(retiringOn("retirement"))).toBeUndefined();
    expect(retiresBy({ owners: [] })).toBeUndefined();
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

  // Sam retires with the plan's owner: in 2053 where the owner retires
  // at 61, and past the end of a plan to 91 where they retire on
  // financial independence, until a run says otherwise.
  it("reads the plan's year for anyone retiring with its owner, refusing its owner retiring with themselves", () => {
    const withSam = { ...sam, retirement: "retirement" } as const;
    const plan = { ...retiring, owners: [owners[0], withSam] };

    expect(retirementYearOf(withSam, plan)).toBe(2053);
    expect(retirementYearOf(withSam, { ...plan, retires: 92 })).toBe(2084);
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
      timed({ ...salary, firstYear: 2030, startsAt: 7 }, milestones, retiring),
    ).toStrictEqual({ ...salary, firstYear: 2040, startsAt: 7 });
  });

  // Ada reaches 18 in 2033, so a line ending then runs the whole of 2032.
  it("reads an end tied to a milestone at someone else's age off theirs", () => {
    expect(
      timed({ ...salary, endsAt: adaAt18.id }, [adaAt18], raising),
    ).toMatchObject({ lastMonth: null, lastYear: 2032 });
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
      timed({ ...salary, endsAt: 10, startsAt: 9 }, milestones, retiring),
    ).toStrictEqual({ ...salary, endsAt: 10, startsAt: 9 });
  });
});

describe("untied", () => {
  it("fixes each end tied to the milestone in the year it falls in now, and leaves the rest tied", () => {
    expect(
      untied(
        { ...salary, endsAt: 8, firstYear: 2040, lastYear: 2058, startsAt: 7 },
        kidsLeave,
        retiring,
      ),
    ).toStrictEqual({
      ...salary,
      endsAt: 8,
      firstYear: 2040,
      lastYear: 2058,
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
      lastYear: 2058,
    });
    expect(
      untied({ ...salary, endsAfter: 3, endsAt: 8 }, downsize, retiring),
    ).toStrictEqual({
      ...salary,
      endsAfter: 0,
      endsAt: null,
      lastMonth: null,
      lastYear: 2061,
    });
    expect(untied(salary, downsize, retiring)).toStrictEqual(salary);
  });

  it("fixes an end tied to a milestone at someone else's age in the year they reach it", () => {
    expect(
      untied({ ...salary, startsAt: adaAt18.id }, adaAt18, raising),
    ).toStrictEqual({ ...salary, firstYear: 2033, startsAt: null });
  });

  // Nothing is tied to a milestone reached when conditions hold, and
  // it has no year to fix an end in.
  it("leaves every line as it is for a milestone reached when conditions hold", () => {
    const tied = { ...salary, startsAt: 9 };

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
