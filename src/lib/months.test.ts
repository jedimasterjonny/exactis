// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  formatDay,
  isOnOrBefore,
  monthName,
  monthsBetween,
  thisMonth,
  today,
} from "./months";

describe("formatDay", () => {
  // Read in UTC, so the first of the year stays in its own year
  // wherever the clock is.
  it("writes an ISO date's day, its month cut short and its year", () => {
    expect(formatDay("2026-11-04")).toBe("4 Nov 2026");
    expect(formatDay("2027-01-01")).toBe("1 Jan 2027");
    expect(formatDay("2026-09-24")).toBe("24 Sep 2026");
  });
});

describe("monthName", () => {
  // Three letters whatever the runtime's locale data abbreviates to, so
  // a server's September and a browser's are spelt alike.
  it("names a month in full or in three letters, January being nought", () => {
    expect(monthName(0, "long")).toBe("January");
    expect(monthName(8, "long")).toBe("September");
    expect(monthName(8, "short")).toBe("Sep");
    expect(monthName(10, "short")).toBe("Nov");
    expect(monthName(11, "short")).toBe("Dec");
  });
});

describe("monthsBetween", () => {
  it("counts the months from one to another, across a year and back", () => {
    expect(
      monthsBetween({ month: 8, year: 2026 }, { month: 8, year: 2026 }),
    ).toBe(0);
    expect(
      monthsBetween({ month: 8, year: 2026 }, { month: 1, year: 2027 }),
    ).toBe(5);
    expect(
      monthsBetween({ month: 1, year: 2027 }, { month: 8, year: 2026 }),
    ).toBe(-5);
  });
});

describe("isOnOrBefore", () => {
  it("takes the same month, and an earlier year or month, and nothing later", () => {
    const march = { month: 2, year: 2028 };

    expect(isOnOrBefore(march, march)).toBe(true);
    expect(isOnOrBefore({ month: 11, year: 2027 }, march)).toBe(true);
    expect(isOnOrBefore({ month: 1, year: 2028 }, march)).toBe(true);
    expect(isOnOrBefore({ month: 3, year: 2028 }, march)).toBe(false);
    expect(isOnOrBefore({ month: 0, year: 2029 }, march)).toBe(false);
  });
});

describe("thisMonth", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the month it is off the clock, January being nought", () => {
    vi.useFakeTimers({ now: new Date(2026, 8, 26), toFake: ["Date"] });

    expect(thisMonth()).toStrictEqual({ month: 8, year: 2026 });
  });
});

describe("today", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the day it is off the clock as an ISO date", () => {
    vi.useFakeTimers({
      now: new Date("2026-09-03T12:00:00Z"),
      toFake: ["Date"],
    });

    expect(today()).toBe("2026-09-03");
  });

  // Half past eleven in UTC is half past midnight in British Summer
  // Time, and still half past eleven in Greenwich Mean Time.
  it("reads the day in the UK's time, whatever zone the clock keeps", () => {
    vi.useFakeTimers({
      now: new Date("2026-10-01T23:30:00Z"),
      toFake: ["Date"],
    });

    expect(today()).toBe("2026-10-02");

    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));

    expect(today()).toBe("2026-12-31");
  });
});
