import { describe, expect, it } from "vitest";

import {
  accountsAndAssets,
  dashboard,
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
    expect(sectionLabel(progress)).toBe("Sect. III · Progress");
    expect(sectionNumeral(progress)).toBe("III");
  });

  it("lists every screen with a distinct typed route", () => {
    const hrefs = screens.map((screen) => screen.href);

    expect(new Set(hrefs).size).toBe(screens.length);
    expect(hrefs).toContain("/accounts");
    expect(hrefs).toContain("/progress");
  });
});
