import { describe, expect, it } from "vitest";

import type { Account } from "@/data/accounts";

import { accounts } from "@/data/accounts.fixture";

import { project } from "./projection";

const [pension, isa, , home, mortgage] = accounts;

const plan = { born: 1990, from: 2026, rate: 0.05 };

describe("project", () => {
  // The ISA: (286,145 + 20,000) × 1.05 = 321,452.25, then (321,452.25 +
  // 20,000) × 1.05 = 358,524.86, the year's contribution landing first
  // and then the year's growth. The pension the same way: (412,880 +
  // 27,195) × 1.05 = 462,078.75, then (462,078.75 + 27,195) × 1.05 =
  // 513,737.44. The current account, the home and the mortgage are no
  // wrapper and are left out.
  it("pays a year's contribution in, then grows the year at the plan rate, by wrapper", () => {
    expect(project(accounts, { ...plan, years: 2 })).toStrictEqual([
      { age: 36, deferred: 412880, free: 286145, year: 2026 },
      { age: 37, deferred: 462079, free: 321452, year: 2027 },
      { age: 38, deferred: 513737, free: 358525, year: 2028 },
    ]);
  });

  // 1,000 + 12 × 100 = 2,200, then 3,400, at no growth so each month's
  // hundred is counted and nothing else is.
  it("pays a monthly contribution in every month", () => {
    const monthly: Account = {
      balance: 1000,
      contribution: { amount: 100, cadence: "month" },
      growth: { kind: "fixed", rate: 0 },
      id: 6,
      kind: "tax-free",
      name: "Regular saver",
    };

    expect(project([monthly], { ...plan, years: 2 })).toStrictEqual([
      { age: 36, deferred: 0, free: 1000, year: 2026 },
      { age: 37, deferred: 0, free: 2200, year: 2027 },
      { age: 38, deferred: 0, free: 3400, year: 2028 },
    ]);
  });

  // 321,452.25 from the ISA and 10,000 × 1.02 = 10,200 from an account
  // with nothing paid in.
  it("grows an account on a fixed rate at its own and sums the accounts", () => {
    const lifetime: Account = {
      balance: 10000,
      growth: { kind: "fixed", rate: 0.02 },
      id: 6,
      kind: "tax-free",
      name: "Lifetime ISA",
    };

    expect(project([isa, lifetime], { ...plan, years: 1 })).toStrictEqual([
      { age: 36, deferred: 0, free: 296145, year: 2026 },
      { age: 37, deferred: 0, free: 331652, year: 2027 },
    ]);
  });

  it("projects nothing when no account is a wrapper", () => {
    expect(project([home, mortgage], { ...plan, years: 1 })).toStrictEqual([
      { age: 36, deferred: 0, free: 0, year: 2026 },
      { age: 37, deferred: 0, free: 0, year: 2027 },
    ]);
  });

  it("holds only today's balances over no years", () => {
    expect(project([pension, isa], { ...plan, years: 0 })).toStrictEqual([
      { age: 36, deferred: 412880, free: 286145, year: 2026 },
    ]);
  });
});
