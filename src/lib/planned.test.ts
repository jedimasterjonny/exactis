// @vitest-environment node
import { describe, expect, it } from "vitest";

import { soundKept } from "@/data/household";
import { kept } from "@/data/household.fixture";
import { pointOf } from "@/data/progress";
import { points } from "@/data/progress.fixture";
import { monthsOn } from "@/engine/projection";
import { sumOf } from "@/lib/ledger";

import { plannedOf } from "./planned";

// The reference household as the store reads it, its balances as of
// August 2026 and its plan from September, with August's point the one
// closing the month read off its accounts, every balance with it.
const { household } = soundKept(kept);
const closed = pointOf(household.accounts, kept.asOf);
const read = { ...household, points: [...points.slice(0, -1), closed] };

describe("plannedOf", () => {
  // The pension and the ISA paid into and growing, the home growing and
  // the mortgage paid down, each month past the one before.
  it("carries net worth twelve months on from the latest point, rising by what the plan pays in and grows", () => {
    const planned = plannedOf(read);

    expect(planned.map(({ month }) => month)).toStrictEqual(
      Array.from({ length: 12 }, (_, index) => ({
        month: (8 + index) % 12,
        year: 2026 + Math.floor((8 + index) / 12),
      })),
    );
    const worths = planned.map(({ worth }) => worth);

    expect(worths).toStrictEqual(worths.toSorted((one, other) => one - other));
    expect(new Set(worths).size).toBe(12);
  });

  // Right after the close the point is what the accounts hold, so the
  // first month is what the plan carries them to. £10,000 more on the
  // home since moves the line only by a month of the home's 2.1% on it.
  it("runs from the point's net worth by what the plan moves the accounts, so a balance edited since moves it by its growth alone", () => {
    const [first] = plannedOf(read);
    const carried = monthsOn(read.accounts, read.schedule, {
      months: 1,
      plan: read.plan,
    });

    expect(first?.worth).toBe(
      Math.round(sumOf(carried, ({ balance }) => balance)),
    );

    const edited = plannedOf({
      ...read,
      accounts: read.accounts.map((account) =>
        account.kind === "real-asset"
          ? { ...account, balance: account.balance + 10000 }
          : account,
      ),
    });

    expect((edited[0]?.worth ?? 0) - (first?.worth ?? 0)).toBe(17);
  });

  it("plans nothing from a latest point that is not the month the balances are as of", () => {
    expect(
      plannedOf({
        ...read,
        points: [{ ...closed, month: { month: 6, year: 2026 } }],
      }),
    ).toStrictEqual([]);
  });

  // The sheet's August carries neither, and with its cash written in
  // still lacks the GIAs.
  it("plans nothing from a latest point that lacks cash or the GIAs", () => {
    expect(plannedOf({ ...read, points })).toStrictEqual([]);
    expect(
      plannedOf({ ...read, points: [{ ...points[5], cash: 16900 }] }),
    ).toStrictEqual([]);
  });

  it("plans nothing before any point is kept", () => {
    expect(plannedOf({ ...read, points: [] })).toStrictEqual([]);
  });
});
