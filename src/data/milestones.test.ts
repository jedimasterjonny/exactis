// @vitest-environment node
import { describe, expect, it } from "vitest";

import { retiring } from "@/data/income.fixture";

import { markersOf } from "./milestones";
import { milestones } from "./milestones.fixture";

const [kidsLeave, downsize] = milestones;

describe("markersOf", () => {
  it("lays the milestones out in the order their years come, retirement among them in the year it falls", () => {
    expect(markersOf([downsize, kidsLeave], retiring)).toStrictEqual([
      kidsLeave,
      { id: "retirement", name: "Retirement", year: 2049 },
      downsize,
    ]);
  });

  it("has retirement alone for a household listing none, and first of two in its year", () => {
    const retirement = { id: "retirement", name: "Retirement", year: 2049 };

    expect(markersOf([], retiring)).toStrictEqual([retirement]);
    expect(
      markersOf([{ id: 3, name: "Sabbatical", year: 2049 }], retiring),
    ).toStrictEqual([retirement, { id: 3, name: "Sabbatical", year: 2049 }]);
  });
});
