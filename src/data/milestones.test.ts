// @vitest-environment node
import { describe, expect, it } from "vitest";

import { incomeLines, retiring } from "@/data/income.fixture";

import { isTiedTo, markersOf, timed, untied } from "./milestones";
import { milestones } from "./milestones.fixture";

const [kidsLeave, downsize] = milestones;
const [salary] = incomeLines;

describe("markersOf", () => {
  it("lays the milestones out in the order their years come, retirement among them in the year it falls", () => {
    expect(markersOf([downsize, kidsLeave], retiring)).toStrictEqual([
      kidsLeave,
      { id: "retirement", name: "Retirement", year: 2053 },
      downsize,
    ]);
  });

  it("has retirement alone for a household listing none, and first of two in its year", () => {
    const retirement = { id: "retirement", name: "Retirement", year: 2053 };

    expect(markersOf([], retiring)).toStrictEqual([retirement]);
    expect(
      markersOf([{ id: 3, name: "Sabbatical", year: 2053 }], retiring),
    ).toStrictEqual([retirement, { id: 3, name: "Sabbatical", year: 2053 }]);
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

describe("timed", () => {
  // Retirement at 61 falls in 2053, so a line ending at it runs the
  // whole of 2052 and one starting at it starts in 2053; the children
  // leave home in 2040.
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

  it("leaves an end tied to none as it is, and one tied to a milestone the household does not list", () => {
    expect(timed(salary, milestones, retiring)).toStrictEqual(salary);
    expect(
      timed({ ...salary, endsAt: 99, startsAt: 99 }, milestones, retiring),
    ).toStrictEqual({ ...salary, endsAt: 99, startsAt: 99 });
  });
});

describe("untied", () => {
  it("fixes each end tied to the milestone in the year it falls in now, and leaves the rest tied", () => {
    expect(
      untied(
        { ...salary, endsAt: 2, firstYear: 2040, lastYear: 2058, startsAt: 1 },
        kidsLeave,
      ),
    ).toStrictEqual({
      ...salary,
      endsAt: 2,
      firstYear: 2040,
      lastYear: 2058,
      startsAt: null,
    });
    expect(
      untied({ ...salary, endsAt: 2, lastMonth: 3, lastYear: 2060 }, downsize),
    ).toStrictEqual({
      ...salary,
      endsAt: null,
      lastMonth: null,
      lastYear: 2058,
    });
    expect(untied(salary, downsize)).toStrictEqual(salary);
  });
});
