// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { blank, kept as reference, today } from "@/data/household.fixture";
import { allocation, rates } from "@/data/rates.fixture";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import {
  saveAges,
  saveAllocation,
  saveDeductions,
  saveRates,
  saveRateSet,
} from "./plan";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

standUp(memory, { today });

describe("saveAges", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveAges({ retires: 60 })).rejects.toThrow("redirected");
    expect(await readLatest(db)).toBeNull();
  });

  it("writes the retirement age over the household's, keeping its end age, and draws the page again", async () => {
    expect(await saveAges({ retires: 55 })).toStrictEqual(
      saved({ ends: 89, retires: 55 }),
    );
    expect(await readLatest(db)).toStrictEqual({
      household: { ...blank, ages: { ends: 89, retires: 55 } },
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("writes the end age over the household's, keeping its retirement age", async () => {
    expect(await saveAges({ ends: 95 })).toStrictEqual(
      saved({ ends: 95, retires: 59 }),
    );
  });

  it("refuses an age that is not a whole number, or is below nothing", async () => {
    await expect(saveAges({ retires: 59.5 })).rejects.toThrow(z.ZodError);
    await expect(saveAges({ retires: -1 })).rejects.toThrow(z.ZodError);
    expect(await readLatest(db)).toBeNull();
  });

  // 36 is the age already reached, so a plan to it has no year left.
  it("holds the end age past the age already reached and to 120", async () => {
    await expect(saveAges({ ends: 36, retires: 30 })).resolves.toStrictEqual(
      refused("A plan ends after the age already reached and by 120"),
    );
    await expect(saveAges({ ends: 121 })).resolves.toStrictEqual(
      refused("A plan ends after the age already reached and by 120"),
    );
    expect(await saveAges({ ends: 37, retires: 37 })).toStrictEqual(
      saved({ ends: 37, retires: 37 }),
    );
    expect(await saveAges({ ends: 120 })).toStrictEqual(
      saved({ ends: 120, retires: 37 }),
    );
    expect(await readLatest(db)).toMatchObject({ version: 2 });
  });

  // The household holds a plan to 35, which its owner of 36 has already
  // outlived, as a plan saved years ago would. It is kept as it is rather
  // than held to today again, so a retirement age saved beside it
  // stands, while one past it is still refused.
  it("keeps an end age already outlived rather than refusing a retirement age saved beside it", async () => {
    await keepAfter(db, 0, { ...blank, ages: { ends: 35, retires: 34 } });

    expect(await saveAges({ retires: 30 })).toStrictEqual(
      saved({ ends: 35, retires: 30 }),
    );
    await expect(saveAges({ retires: 36 })).resolves.toStrictEqual(
      refused("A plan's owner retires no later than it ends"),
    );
  });

  // A retirement already past says only that nothing is earned by
  // working, so 30 is sound for someone of 36.
  it("holds the retirement age to the plan's end, but not to the age reached", async () => {
    await expect(saveAges({ retires: 90 })).resolves.toStrictEqual(
      refused("A plan's owner retires no later than it ends"),
    );
    await expect(saveAges({ ends: 58 })).resolves.toStrictEqual(
      refused("A plan's owner retires no later than it ends"),
    );
    expect(await saveAges({ retires: 30 })).toStrictEqual(
      saved({ ends: 89, retires: 30 }),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });
});

describe("saveRates", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveRates({ stocks: 0.06 })).rejects.toThrow("redirected");
    expect(await readLatest(db)).toBeNull();
  });

  it("writes the rates sent over the household's, keeping the rest, and draws the page again", async () => {
    expect(await saveRates({ dividends: 0.02, stocks: 0.0595 })).toStrictEqual(
      saved({ ...blank.rates, dividends: 0.02, stocks: 0.0595 }),
    );
    expect(await readLatest(db)).toStrictEqual({
      household: {
        ...blank,
        rates: { ...blank.rates, dividends: 0.02, stocks: 0.0595 },
      },
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();

    expect(await saveRates(rates)).toStrictEqual(saved(rates));
  });

  it("refuses a rate that is not a number", async () => {
    await expect(saveRates({ bonds: Number.NaN })).rejects.toThrow(z.ZodError);
    await expect(
      saveRates({ inflation: Number.POSITIVE_INFINITY }),
    ).rejects.toThrow(z.ZodError);
    expect(await readLatest(db)).toBeNull();
  });

  it("holds each rate to its rule, in the household's words", async () => {
    await expect(saveRates({ stocks: -1.5 })).resolves.toStrictEqual(
      refused("A rate loses no more than everything"),
    );
    await expect(saveRates({ dividends: -0.01 })).resolves.toStrictEqual(
      refused("A dividend yield is nothing or more"),
    );
    await expect(saveRates({ inflation: -1 })).resolves.toStrictEqual(
      refused("Inflation is a rate, and prices fall by less than everything"),
    );
    expect(await readLatest(db)).toBeNull();
  });

  // The reference's mortgage pays £2,210 a month on £182,940. Charged
  // the plan rate rather than its own 5.15%, it clears at 5% in stocks,
  // and never at 20%, where the month's interest is £3,049.
  it("refuses rates that leave a debt charged the plan rate never paid off", async () => {
    await keepAfter(db, 0, {
      ...reference,
      accounts: reference.accounts.map((listed) =>
        listed.id === 5 ? { ...listed, growth: { kind: "plan" } } : listed,
      ),
    });

    await expect(saveRates({ stocks: 0.2 })).resolves.toStrictEqual(
      refused("A debt's payments end"),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });
});

describe("saveAllocation", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveAllocation(allocation)).rejects.toThrow("redirected");
    expect(await readLatest(db)).toBeNull();
  });

  it("writes the split over the household's and draws the page again", async () => {
    expect(await saveAllocation(allocation)).toStrictEqual(saved(allocation));
    expect(await readLatest(db)).toStrictEqual({
      household: { ...blank, allocation },
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refuses a share that is not a number", async () => {
    await expect(saveAllocation({ stocks: Number.NaN })).rejects.toThrow(
      z.ZodError,
    );
    expect(await readLatest(db)).toBeNull();
  });

  it("holds the share to none of the savings, all of them, or a share", async () => {
    for (const stocks of [-0.1, 1.1]) {
      await expect(saveAllocation({ stocks })).resolves.toStrictEqual(
        refused("Stocks hold none of the savings, all of them, or a share"),
      );
    }
    expect(await saveAllocation({ stocks: 0 })).toStrictEqual(
      saved({ stocks: 0 }),
    );
    expect(await saveAllocation({ stocks: 1 })).toStrictEqual(
      saved({ stocks: 1 }),
    );
  });

  // The reference's mortgage, charged the plan rate, clears at bonds'
  // 3% and never at stocks' 20%, where the month's interest on
  // £182,940 is £3,049 against the £2,210 paid.
  it("refuses a split that leaves a debt charged the plan rate never paid off", async () => {
    await keepAfter(db, 0, {
      ...reference,
      accounts: reference.accounts.map((listed) =>
        listed.id === 5 ? { ...listed, growth: { kind: "plan" } } : listed,
      ),
      allocation: { stocks: 0 },
      rates: { ...reference.rates, bonds: 0.03, stocks: 0.2 },
    });

    await expect(saveAllocation({ stocks: 1 })).resolves.toStrictEqual(
      refused("A debt's payments end"),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });
});

describe("saveDeductions", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveDeductions({ fees: 0.002 })).rejects.toThrow("redirected");
    expect(await readLatest(db)).toBeNull();
  });

  it("writes the deductions sent over the household's, keeping the rest, and draws the page again", async () => {
    expect(await saveDeductions({ fees: 0.0025 })).toStrictEqual(
      saved({ dividends: 0.02, fees: 0.0025 }),
    );
    expect(await readLatest(db)).toStrictEqual({
      household: { ...blank, deductions: { dividends: 0.02, fees: 0.0025 } },
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();

    expect(await saveDeductions({ dividends: 0.019 })).toStrictEqual(
      saved({ dividends: 0.019, fees: 0.0025 }),
    );
  });

  it("refuses a deduction that is not a number", async () => {
    await expect(saveDeductions({ fees: Number.NaN })).rejects.toThrow(
      z.ZodError,
    );
    expect(await readLatest(db)).toBeNull();
  });

  it("holds each deduction to its rule, in the household's words", async () => {
    await expect(saveDeductions({ fees: -0.001 })).resolves.toStrictEqual(
      refused("A fee is nothing or more"),
    );
    await expect(saveDeductions({ dividends: -0.01 })).resolves.toStrictEqual(
      refused("A dividend yield is nothing or more"),
    );
    expect(await readLatest(db)).toBeNull();
  });

  // Fees of 150% leave stocks growing at less than losing everything,
  // which the rates typed are never asked to make while they are not
  // the ones live.
  it("holds the rates the deductions make to their rules while the CMA's are live", async () => {
    await keepAfter(db, 0, reference);

    expect(await saveDeductions({ fees: 1.5 })).toStrictEqual(
      saved({ dividends: 0.02, fees: 1.5 }),
    );

    await keepAfter(db, 2, { ...reference, rateSet: "cma" });

    await expect(saveDeductions({ fees: 1.5 })).resolves.toStrictEqual(
      refused("A rate loses no more than everything"),
    );
    expect(await readLatest(db)).toMatchObject({ version: 3 });
  });
});

describe("saveRateSet", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveRateSet("custom")).rejects.toThrow("redirected");
    expect(await readLatest(db)).toBeNull();
  });

  it("chooses the CMA's rates while the CMA gives some, draws the page again, and chooses the rates typed back", async () => {
    await keepAfter(db, 0, reference);

    expect(await saveRateSet("cma")).toStrictEqual(saved("cma"));
    expect(await readLatest(db)).toStrictEqual({
      household: { ...reference, rateSet: "cma" },
      version: 2,
    });
    expect(refresh).toHaveBeenCalledOnce();

    expect(await saveRateSet("custom")).toStrictEqual(saved("custom"));
    expect(await readLatest(db)).toMatchObject({
      household: { rateSet: "custom" },
      version: 3,
    });
  });

  it("refuses the CMA's rates while the CMA gives none, saying what is missing, and keeps nothing", async () => {
    await expect(saveRateSet("cma")).resolves.toStrictEqual(
      refused("No CMA is pulled, so the plan cannot run on the CMA's rates"),
    );

    await keepAfter(db, 0, { ...reference, curve: null });

    await expect(saveRateSet("cma")).resolves.toStrictEqual(
      refused(
        "No inflation curve is pulled, so the plan cannot run on the CMA's rates",
      ),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });
});
