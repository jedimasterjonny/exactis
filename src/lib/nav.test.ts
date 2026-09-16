import { describe, expect, it } from "vitest";

import {
  accountsAndAssets,
  dashboard,
  plan,
  progress,
  screens,
  sectionLabel,
  sectionNumeral,
} from "./nav";

describe("sectionLabel", () => {
  it("numbers each screen by its place in the navigation", () => {
    expect(sectionLabel(dashboard)).toBe("Sect. I · Dashboard");
    expect(sectionLabel(accountsAndAssets)).toBe(
      "Sect. II · Accounts & assets",
    );
    expect(sectionLabel(plan)).toBe("Sect. III · Plan");
    expect(sectionLabel(progress)).toBe("Sect. IV · Progress");
    expect(sectionNumeral(progress)).toBe("IV");
  });

  it("lists every screen with a distinct typed route", () => {
    const hrefs = screens.map((screen) => screen.href);

    expect(new Set(hrefs).size).toBe(screens.length);
    expect(hrefs).toContain("/accounts");
    expect(hrefs).toContain("/plan");
    expect(hrefs).toContain("/progress");
  });
});
