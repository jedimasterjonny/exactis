// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { cma } from "@/data/cma.fixture";
import { blank, kept as reference, today } from "@/data/household.fixture";
import { atAge } from "@/data/milestones";
import { owners, sam } from "@/data/owners.fixture";
import { allocation, rates } from "@/data/rates.fixture";
import { stamped } from "@/data/shapes";
import { targetsUnder } from "@/data/targets.fixture";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import {
  removeAnchor,
  saveAges,
  saveAllocation,
  saveAnchor,
  saveDeductions,
  saveDrawdown,
  saveRates,
  saveRateSet,
} from "./plan";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

const [me] = owners;

standUp(memory, { today });

// The household before anything is saved, its one owner retiring at the
// age given.
function retiringAt(retires: number): typeof blank {
  return {
    ...blank,
    owners: blank.owners.map((owner) => ({
      ...owner,
      retirement: atAge(retires),
    })),
  };
}

describe("saveAges", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveAges({ retires: 60 })).rejects.toThrow("redirected");
    expect(await readLatest(db, "")).toBeNull();
  });

  // The dashboard was drawn in a scenario that was left before the age
  // it held back was sent; then one drawn on the household.
  it("refuses a save naming a branch other than the one open, and keeps one naming the branch open", async () => {
    await expect(
      saveAges({ retires: 55 }, "Retire early"),
    ).resolves.toStrictEqual(
      refused(
        "Another branch was opened before this was saved, so nothing was; make the change again",
      ),
    );
    expect(await readLatest(db, "")).toBeNull();

    expect(await saveAges({ retires: 55 }, null)).toStrictEqual(
      saved({ ends: 89, retires: 55 }),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  // The plan is the first listed owner's, so the retirement age is
  // written onto them and nobody else.
  it("writes the retirement age onto the first listed owner, keeping the end age, and draws the page again", async () => {
    expect(await saveAges({ retires: 55 })).toStrictEqual(
      saved({ ends: 89, retires: 55 }),
    );
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped(retiringAt(55)),
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();

    await keepAfter(
      db,
      { scenario: "", version: 1 },
      { ...blank, next: 3, owners: [me, sam] },
    );

    expect(await saveAges({ retires: 50 })).toStrictEqual(
      saved({ ends: 89, retires: 50 }),
    );
    expect(await readLatest(db, "")).toMatchObject({
      household: { owners: [{ ...me, retirement: atAge(50) }, sam] },
      version: 3,
    });
  });

  it("writes the end age over the household's, keeping its retirement age", async () => {
    expect(await saveAges({ ends: 95 })).toStrictEqual(
      saved({ ends: 95, retires: 59 }),
    );
  });

  it("refuses an age that is not a whole number, or is below nothing", async () => {
    await expect(saveAges({ retires: 59.5 })).rejects.toThrow(z.ZodError);
    await expect(saveAges({ retires: -1 })).rejects.toThrow(z.ZodError);
    expect(await readLatest(db, "")).toBeNull();
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
    expect(await readLatest(db, "")).toMatchObject({ version: 2 });
  });

  // The household holds a plan to 35, which its owner of 36 has already
  // outlived, as a plan saved years ago would. It is kept as it is rather
  // than held to today again, so a retirement age saved beside it
  // stands, while one past it is still refused.
  it("keeps an end age already outlived rather than refusing a retirement age saved beside it", async () => {
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      { ...retiringAt(34), ages: { ends: 35 } },
    );

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
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });
});

describe("saveRates", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveRates({ stocks: 0.06 })).rejects.toThrow("redirected");
    expect(await readLatest(db, "")).toBeNull();
  });

  it("writes the rates sent over the household's, keeping the rest, and draws the page again", async () => {
    expect(await saveRates({ dividends: 0.02, stocks: 0.0595 })).toStrictEqual(
      saved({ ...blank.rates, dividends: 0.02, stocks: 0.0595 }),
    );
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({
        ...blank,
        rates: { ...blank.rates, dividends: 0.02, stocks: 0.0595 },
      }),
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
    expect(await readLatest(db, "")).toBeNull();
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
    expect(await readLatest(db, "")).toBeNull();
  });

  // The reference's mortgage pays £2,210 a month on £182,940. Charged
  // the plan rate rather than its own 5.15%, it clears at 5% in stocks,
  // and never at 20%, where the month's interest is £3,049.
  it("refuses rates that leave a debt charged the plan rate never paid off", async () => {
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      {
        ...reference,
        accounts: reference.accounts.map((listed) =>
          listed.id === 5 ? { ...listed, growth: { kind: "plan" } } : listed,
        ),
      },
    );

    await expect(saveRates({ stocks: 0.2 })).resolves.toStrictEqual(
      refused("A debt's payments end"),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });
});

describe("saveAnchor", () => {
  const glide = [
    { age: 50, bonds: 0.1 },
    { age: 58, bonds: 0.35 },
  ];

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveAnchor(null, { age: 50, bonds: 0.1 })).rejects.toThrow(
      "redirected",
    );
    expect(await readLatest(db, "")).toBeNull();
  });

  it("writes a new anchor beside the household's, youngest first, and draws the page again", async () => {
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      { ...blank, glide: glide.slice(1) },
    );

    expect(await saveAnchor(null, { age: 50, bonds: 0.1 })).toStrictEqual(
      saved({ age: 50, bonds: 0.1 }),
    );
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({ ...blank, glide }),
      version: 2,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  // The screen drew 50 and 58; another tab has since added 65, which an
  // edit of 58 keeps.
  it("writes an anchor in place of the one at the age it was saved at, keeping one added since", async () => {
    const since = { age: 65, bonds: 0.35 };
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      { ...blank, glide: [...glide, since] },
    );

    expect(await saveAnchor(58, { age: 60, bonds: 0.3 })).toStrictEqual(
      saved({ age: 60, bonds: 0.3 }),
    );
    expect(await readLatest(db, "")).toMatchObject({
      household: { glide: [glide[0], { age: 60, bonds: 0.3 }, since] },
    });
  });

  it("refuses an anchor at an age no anchor is at, deleted since", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, { ...blank, glide });

    expect(await saveAnchor(65, { age: 65, bonds: 0.2 })).toStrictEqual(
      refused("No anchor is at that age"),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  it("refuses an anchor that is not a number", async () => {
    await expect(
      saveAnchor(null, { age: 50, bonds: Number.NaN }),
    ).rejects.toThrow(z.ZodError);
    expect(await readLatest(db, "")).toBeNull();
  });

  it("holds an age to one anchor, and each anchor to its rules", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, { ...blank, glide });

    expect(await saveAnchor(null, { age: 58, bonds: 0.2 })).toStrictEqual(
      refused("An age holds one anchor, youngest first"),
    );
    expect(await saveAnchor(50, { age: 50, bonds: 1.1 })).toStrictEqual(
      refused("Bonds hold none of the savings, all of them, or a share"),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  // All in equities under the CMA's rates, nothing says what bonds
  // return.
  it("refuses an anchor the CMA's rates cannot run on while they are live", async () => {
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      { ...reference, rateSet: "cma", targets: targetsUnder("Equity") },
    );

    expect(await saveAnchor(null, { age: 58, bonds: 0.35 })).toStrictEqual(
      refused(
        "The glide path holds bonds the target allocation holds none of, so nothing says what they return, so the plan cannot run on the CMA's rates",
      ),
    );
  });
});

describe("removeAnchor", () => {
  const glide = [
    { age: 50, bonds: 0.1 },
    { age: 58, bonds: 0.35 },
  ];

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(removeAnchor(50)).rejects.toThrow("redirected");
    expect(await readLatest(db, "")).toBeNull();
  });

  it("deletes the anchor at the age given, keeping the rest, and draws the page again", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, { ...blank, glide });

    expect(await removeAnchor(58)).toStrictEqual(saved(undefined));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({ ...blank, glide: glide.slice(0, 1) }),
      version: 2,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refuses an age no anchor is at, deleted since", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, { ...blank, glide });

    expect(await removeAnchor(65)).toStrictEqual(
      refused("No anchor is at that age"),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  it("refuses an age that is not a number", async () => {
    await expect(removeAnchor(Number.NaN)).rejects.toThrow(z.ZodError);
  });
});

describe("saveAllocation", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveAllocation(allocation)).rejects.toThrow("redirected");
    expect(await readLatest(db, "")).toBeNull();
  });

  it("writes the split over the household's and draws the page again", async () => {
    expect(await saveAllocation(allocation)).toStrictEqual(saved(allocation));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({ ...blank, allocation }),
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refuses a share that is not a number", async () => {
    await expect(saveAllocation({ stocks: Number.NaN })).rejects.toThrow(
      z.ZodError,
    );
    expect(await readLatest(db, "")).toBeNull();
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
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      {
        ...reference,
        accounts: reference.accounts.map((listed) =>
          listed.id === 5 ? { ...listed, growth: { kind: "plan" } } : listed,
        ),
        allocation: { stocks: 0 },
        rates: { ...reference.rates, bonds: 0.03, stocks: 0.2 },
      },
    );

    await expect(saveAllocation({ stocks: 1 })).resolves.toStrictEqual(
      refused("A debt's payments end"),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });
});

describe("saveDeductions", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveDeductions({ fees: 0.002 })).rejects.toThrow("redirected");
    expect(await readLatest(db, "")).toBeNull();
  });

  it("writes the deductions sent over the household's, keeping the rest, dated today, and draws the page again", async () => {
    expect(await saveDeductions({ fees: 0.0025 })).toStrictEqual(
      saved({ dividends: 0.02, fees: 0.0025, setOn: "2026-09-15" }),
    );
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({
        ...blank,
        deductions: { dividends: 0.02, fees: 0.0025, setOn: "2026-09-15" },
      }),
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();

    expect(await saveDeductions({ dividends: 0.019 })).toStrictEqual(
      saved({ dividends: 0.019, fees: 0.0025, setOn: "2026-09-15" }),
    );
  });

  // Kept on the first of the month and confirmed on the fifteenth.
  it("confirms the deductions still right, keeping both and dating them today, when sent neither", async () => {
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      {
        ...reference,
        deductions: { dividends: 0.019, fees: 0.0025, setOn: "2026-09-01" },
      },
    );

    expect(await saveDeductions({})).toStrictEqual(
      saved({ dividends: 0.019, fees: 0.0025, setOn: "2026-09-15" }),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 2 });
  });

  it("refuses a deduction that is not a number", async () => {
    await expect(saveDeductions({ fees: Number.NaN })).rejects.toThrow(
      z.ZodError,
    );
    expect(await readLatest(db, "")).toBeNull();
  });

  it("holds each deduction to its rule, in the household's words", async () => {
    await expect(saveDeductions({ fees: -0.001 })).resolves.toStrictEqual(
      refused("A fee is nothing or more"),
    );
    await expect(saveDeductions({ dividends: -0.01 })).resolves.toStrictEqual(
      refused("A dividend yield is nothing or more"),
    );
    await expect(saveDeductions({ fees: 0.11 })).resolves.toStrictEqual(
      refused("A deduction is no more than 10%"),
    );
    await expect(saveDeductions({ dividends: 0.11 })).resolves.toStrictEqual(
      refused("A deduction is no more than 10%"),
    );
    expect(await readLatest(db, "")).toBeNull();
  });

  // Fees of 10% off classes losing 95% a year leave stocks growing at
  // less than losing everything, which the rates typed are never asked
  // to make while they are not the ones live.
  it("holds the rates the deductions make to their rules while the CMA's are live", async () => {
    const losing = {
      ...reference,
      cma: {
        latest: {
          ...cma,
          assets: cma.assets.map((asset) => ({ ...asset, rate: -0.95 })),
        },
        previous: null,
      },
    };
    await keepAfter(db, { scenario: "", version: 0 }, losing);

    expect(await saveDeductions({ fees: 0.1 })).toStrictEqual(
      saved({ dividends: 0.02, fees: 0.1, setOn: "2026-09-15" }),
    );

    await keepAfter(
      db,
      { scenario: "", version: 2 },
      { ...losing, rateSet: "cma" },
    );

    await expect(saveDeductions({ fees: 0.1 })).resolves.toStrictEqual(
      refused("A rate loses no more than everything"),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 3 });
  });
});

describe("saveDrawdown", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveDrawdown("pension-first")).rejects.toThrow("redirected");
    expect(await readLatest(db, "")).toBeNull();
  });

  // A household that has never chosen draws its savings first, so the
  // name saved over it is written whole, and the savings chosen back are
  // written as a name rather than as none.
  it("writes the drawdown over the household's, draws the page again, and writes the savings first back", async () => {
    expect(await saveDrawdown("pension-first")).toStrictEqual(
      saved("pension-first"),
    );
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({ ...blank, drawdown: "pension-first" }),
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();

    expect(await saveDrawdown("savings-first")).toStrictEqual(
      saved("savings-first"),
    );
    expect(await readLatest(db, "")).toMatchObject({
      household: { drawdown: "savings-first" },
      version: 2,
    });
  });
});

describe("saveRateSet", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveRateSet("custom")).rejects.toThrow("redirected");
    expect(await readLatest(db, "")).toBeNull();
  });

  it("chooses the CMA's rates while the CMA gives some, draws the page again, and chooses the rates typed back", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, reference);

    expect(await saveRateSet("cma")).toStrictEqual(saved("cma"));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({ ...reference, rateSet: "cma" }),
      version: 2,
    });
    expect(refresh).toHaveBeenCalledOnce();

    expect(await saveRateSet("custom")).toStrictEqual(saved("custom"));
    expect(await readLatest(db, "")).toMatchObject({
      household: { rateSet: "custom" },
      version: 3,
    });
  });

  it("refuses the CMA's rates while the CMA gives none, saying what is missing, and keeps nothing", async () => {
    await expect(saveRateSet("cma")).resolves.toStrictEqual(
      refused("No CMA is pulled, so the plan cannot run on the CMA's rates"),
    );

    await keepAfter(
      db,
      { scenario: "", version: 0 },
      { ...reference, curve: null },
    );

    await expect(saveRateSet("cma")).resolves.toStrictEqual(
      refused(
        "No inflation curve is pulled, so the plan cannot run on the CMA's rates",
      ),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });
});
