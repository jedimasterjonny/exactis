// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  accountsAndAssets,
  assumptions,
  chance,
  dashboard,
  plan,
  progress,
  screenAt,
  screens,
  sectionLabel,
  sectionNumeral,
  subsectionLabel,
} from "./nav";

describe("sectionLabel", () => {
  it("numbers each screen by its place in the navigation", () => {
    expect(sectionLabel(dashboard)).toBe("Sect. I · Dashboard");
    expect(sectionLabel(chance)).toBe("Sect. II · Chance of success");
    expect(sectionLabel(accountsAndAssets)).toBe(
      "Sect. III · Accounts & assets",
    );
    expect(sectionLabel(plan)).toBe("Sect. IV · Income & expenses");
    expect(sectionLabel(progress)).toBe("Sect. V · Progress");
    expect(sectionNumeral(progress)).toBe("V");
    expect(sectionLabel(assumptions)).toBe("Sect. VI · Assumptions");
  });

  it("numbers a card within a screen in lower case after the screen's", () => {
    expect(subsectionLabel(plan, 1)).toBe("Sect. IV.i");
    expect(subsectionLabel(plan, 3)).toBe("Sect. IV.iii");
    expect(subsectionLabel(progress, 4)).toBe("Sect. V.iv");
    expect(subsectionLabel(assumptions, 6)).toBe("Sect. VI.vi");
    expect(subsectionLabel(assumptions, 2)).toBe("Sect. VI.ii");
  });

  it("writes a place past the numerals in figures", () => {
    expect(subsectionLabel(plan, 7)).toBe("Sect. IV.7");
  });

  it("lists every screen with a distinct typed route", () => {
    const hrefs = screens.map((screen) => screen.href);

    expect(new Set(hrefs).size).toBe(screens.length);
    expect(hrefs).toContain("/chance");
    expect(hrefs).toContain("/accounts");
    expect(hrefs).toContain("/plan");
    expect(hrefs).toContain("/progress");
    expect(hrefs).toContain("/assumptions");
  });
});

describe("screenAt", () => {
  it("finds the screen at its own route and none anywhere else", () => {
    expect(screenAt("/")).toBe(dashboard);
    expect(screenAt("/plan")).toBe(plan);
    expect(screenAt("/plan/extra")).toBeUndefined();
    expect(screenAt("/login")).toBeUndefined();
  });
});
