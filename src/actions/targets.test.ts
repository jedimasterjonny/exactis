// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { mappings } from "@/data/cma.fixture";
import { blank, kept as reference, today } from "@/data/household.fixture";
import { stamped } from "@/data/shapes";
import { targets } from "@/data/targets.fixture";
import { getDb } from "@/db/client";
import { decideScenario, keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { readLatestPortfolio } from "@/db/portfolio";
import { portfolioFiles } from "@/db/schema";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { readPortfolioTargets } from "@/lib/portfolio-file";
import {
  clientOf,
  portfolioFile,
  samplePortfolioFile,
} from "@/lib/portfolio-file.fixture";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

import { mapByName, mapCategory, syncTargetsFromPortfolio } from "./targets";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

standUp(memory, { today });

describe("mapCategory", () => {
  // FTSE USA, which the reference maps onto nothing, and UK equity,
  // which it maps onto UK large cap equities.
  const [usa, ukEquity] = ["FTSE USA", "UK equity"].map(
    (name) =>
      targets.categories.find((category) => category.name === name)?.id ?? "",
  );

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(
      mapCategory({ asset: "US large cap equities", category: "any" }),
    ).rejects.toThrow("redirected");
    expect(await readLatest(db, "")).toBeNull();
  });

  it("maps a category onto a class the latest CMA prices, draws the page again and hands every mapping back", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, reference);
    const mapped = [
      ...mappings,
      { asset: "Global ex-UK large cap equities", category: usa },
    ];

    expect(
      await mapCategory({
        asset: "Global ex-UK large cap equities",
        category: usa ?? "",
      }),
    ).toStrictEqual(saved(mapped));
    expect(await readLatest(db, "")).toStrictEqual({
      household: { ...stamped(reference), mappings: mapped },
      version: 2,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("maps a category over the class it was mapped onto, and onto none", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, reference);
    const others = mappings.filter(({ category }) => category !== ukEquity);

    expect(
      await mapCategory({
        asset: "Global small cap equities",
        category: ukEquity ?? "",
      }),
    ).toStrictEqual(
      saved([
        ...others,
        { asset: "Global small cap equities", category: ukEquity },
      ]),
    );
    expect(
      await mapCategory({ asset: null, category: ukEquity ?? "" }),
    ).toStrictEqual(saved(others));
    expect(await readLatest(db, "")).toMatchObject({
      household: { mappings: others },
      version: 3,
    });
  });

  it("refuses a category the target allocation does not list, and keeps nothing", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, reference);

    expect(
      await mapCategory({
        asset: "UK cash",
        category: "Asset Allocation/Cash",
      }),
    ).toStrictEqual(refused("A category is mapped once it is synced"));
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  it("refuses any category before a target allocation is synced", async () => {
    expect(
      await mapCategory({ asset: null, category: ukEquity ?? "" }),
    ).toStrictEqual(refused("A category is mapped once it is synced"));
    expect(await readLatest(db, "")).toBeNull();
  });

  it("refuses a class the latest CMA does not price, or any before one is pulled", async () => {
    await keepAfter(db, { scenario: "", version: 0 }, reference);

    expect(
      await mapCategory({
        asset: "Canada large cap equities",
        category: ukEquity ?? "",
      }),
    ).toStrictEqual(
      refused("The latest CMA prices no Canada large cap equities"),
    );

    await keepAfter(
      db,
      { scenario: "", version: 1 },
      { ...reference, cma: null },
    );

    expect(
      await mapCategory({ asset: "UK cash", category: ukEquity ?? "" }),
    ).toStrictEqual(refused("The latest CMA prices no UK cash"));
    expect(await readLatest(db, "")).toMatchObject({ version: 2 });
  });

  // Only a bug or a forgery sends a class with no name, so it fails
  // loudly rather than being refused.
  it("fails on a class with no name, and keeps nothing", async () => {
    await expect(
      mapCategory({ asset: " ", category: ukEquity ?? "" }),
    ).rejects.toThrow(z.ZodError);
    expect(await readLatest(db, "")).toBeNull();
  });
});

describe("mapByName", () => {
  // FTSE USA has no class in the reference, and its name
  // suggests US large caps; UK equity is mapped onto Canada, which no
  // vintage prices, and its name suggests UK large caps.
  const idOf = (name: string): string =>
    targets.categories.find((category) => category.name === name)?.id ?? "";
  const usa = idOf("FTSE USA");
  const ukEquity = idOf("UK equity");

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(mapByName()).rejects.toThrow("redirected");
    expect(await readLatest(db, "")).toBeNull();
  });

  it("maps each category the CMA cannot blend onto its suggestion, draws the page again and hands back what it mapped", async () => {
    const stale = mappings.map((mapping) =>
      mapping.category === ukEquity
        ? { ...mapping, asset: "Canada large cap equities" }
        : mapping,
    );
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      { ...reference, mappings: stale },
    );
    const mapped = [
      { asset: "UK large cap equities", category: ukEquity },
      { asset: "US large cap equities", category: usa },
    ];

    expect(await mapByName()).toStrictEqual(saved(mapped));
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({
        ...reference,
        mappings: [
          ...stale.filter(({ category }) => category !== ukEquity),
          ...mapped,
        ],
      }),
      version: 2,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refuses when no category without a class has one suggested, and keeps nothing", async () => {
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      {
        ...reference,
        mappings: [
          ...mappings,
          { asset: "US large cap equities", category: usa },
        ],
      },
    );

    expect(await mapByName()).toStrictEqual(
      refused("No category without a class has one suggested"),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
  });

  it("refuses before a CMA is pulled or a target allocation synced", async () => {
    const refusal = refused(
      "Categories are mapped by name once a CMA is pulled and a target allocation synced",
    );

    expect(await mapByName()).toStrictEqual(refusal);

    await keepAfter(
      db,
      { scenario: "", version: 0 },
      { ...reference, cma: null },
    );

    expect(await mapByName()).toStrictEqual(refusal);

    await keepAfter(
      db,
      { scenario: "", version: 1 },
      { ...reference, targets: null },
    );

    expect(await mapByName()).toStrictEqual(refusal);
    expect(await readLatest(db, "")).toMatchObject({ version: 2 });
  });
});

describe("syncTargetsFromPortfolio", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(syncTargetsFromPortfolio()).rejects.toThrow("redirected");
    expect(getDb).not.toHaveBeenCalled();
    expect(await readLatest(db, "")).toBeNull();
  });

  it("refuses before a portfolio file is uploaded and writes nothing", async () => {
    expect(await syncTargetsFromPortfolio()).toStrictEqual(
      refused("Upload a portfolio file before syncing"),
    );
    expect(await readLatest(db, "")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses cleanly when the stored file has no Asset Allocation taxonomy or unbalanced shares", async () => {
    await db
      .insert(portfolioFiles)
      .values({
        content: portfolioFile(clientOf([])),
        fileName: "plain.portfolio",
        savedAt: new Date("2026-09-14T12:00:00Z"),
        version: 1,
      });

    expect(await syncTargetsFromPortfolio()).toStrictEqual(
      refused("The file has no Asset Allocation taxonomy, only none"),
    );
    expect(await readLatest(db, "")).toBeNull();

    const halfWeighted = portfolioFile([
      [1, 66],
      [
        8,
        [
          [1, "tax-aa"],
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "aa-root"],
              [3, "Asset Allocation"],
              [6, 10_000],
            ],
          ],
          [
            5,
            [
              [1, "aa-half"],
              [2, "aa-root"],
              [3, "Half only"],
              [6, 5000],
            ],
          ],
        ],
      ],
      [12, "GBP"],
    ]);
    await db
      .insert(portfolioFiles)
      .values({
        content: halfWeighted,
        fileName: "half.portfolio",
        savedAt: new Date("2026-09-15T12:00:00Z"),
        version: 2,
      });

    expect(await syncTargetsFromPortfolio()).toStrictEqual(
      refused("Target category shares must add up to 100%"),
    );
    expect(await readLatest(db, "")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses under live CMA when a synced category has no class and keeps nothing", async () => {
    await keepAfter(
      db,
      { scenario: "", version: 0 },
      { ...reference, rateSet: "cma" },
    );
    await db
      .insert(portfolioFiles)
      .values({
        content: samplePortfolioFile(),
        fileName: "northstar.portfolio",
        savedAt: new Date("2026-09-15T12:00:00Z"),
        version: 1,
      });

    expect(await syncTargetsFromPortfolio()).toStrictEqual(
      refused(
        "Global equity has no CMA class, so this allocation cannot be synced while the plan runs on the CMA's rates. Choose custom rates, sync it and give its new categories a class, then choose From CMA again",
      ),
    );
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("stamps importedOn from the file's latest quote or transaction date, falling back to UK save date when undated, without mutating portfolio_files", async () => {
    const datedBytes = samplePortfolioFile();
    const savedAt = new Date("2026-07-01T23:30:00Z");
    await db
      .insert(portfolioFiles)
      .values({
        content: datedBytes,
        fileName: "northstar.portfolio",
        savedAt,
        version: 1,
      });
    const { categories: datedCategories, portfolios: datedPortfolios } =
      readPortfolioTargets(datedBytes);
    const expectedDated = {
      categories: datedCategories,
      importedOn: "2026-09-22",
      portfolios: datedPortfolios,
    };

    expect(await syncTargetsFromPortfolio(null)).toStrictEqual(
      saved(expectedDated),
    );
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({ ...blank, targets: expectedDated }),
      version: 1,
    });
    expect(await readLatestPortfolio(db)).toStrictEqual({
      content: datedBytes,
      fileName: "northstar.portfolio",
      savedAt,
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();

    // Without dated quotes or transactions, importedOn falls back to
    // the file's UK save date (23:30 UTC in BST is the next UK day).
    const undatedBytes = portfolioFile([
      [1, 66],
      [
        8,
        [
          [1, "tax-aa"],
          [2, "Asset Allocation"],
          [
            5,
            [
              [1, "aa-root"],
              [3, "Asset Allocation"],
              [6, 10_000],
            ],
          ],
          [
            5,
            [
              [1, "aa-all"],
              [2, "aa-root"],
              [3, "All equity"],
              [6, 10_000],
            ],
          ],
        ],
      ],
      [12, "GBP"],
    ]);
    await db
      .insert(portfolioFiles)
      .values({
        content: undatedBytes,
        fileName: "undated.portfolio",
        savedAt,
        version: 2,
      });
    const { categories: undatedCategories, portfolios: undatedPortfolios } =
      readPortfolioTargets(undatedBytes);
    const expectedUndated = {
      categories: undatedCategories,
      importedOn: "2026-07-02",
      portfolios: undatedPortfolios,
    };

    expect(await syncTargetsFromPortfolio(null)).toStrictEqual(
      saved(expectedUndated),
    );
    expect(await readLatest(db, "")).toStrictEqual({
      household: stamped({ ...blank, targets: expectedUndated }),
      version: 2,
    });
  });

  it("refuses a sync naming a branch other than the one open, and keeps nothing", async () => {
    await db
      .insert(portfolioFiles)
      .values({
        content: samplePortfolioFile(),
        fileName: "northstar.portfolio",
        savedAt: new Date("2026-09-14T12:00:00Z"),
        version: 1,
      });

    expect(await syncTargetsFromPortfolio("Retire early")).toStrictEqual(
      refused(
        "Another branch was opened before this was saved, so nothing was; make the change again",
      ),
    );
    expect(await readLatest(db, "")).toBeNull();
    expect(refresh).not.toHaveBeenCalled();

    await keepAfter(db, { scenario: "", version: 0 }, reference);
    await keepAfter(db, { scenario: "Retire early", version: 0 }, reference);
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    expect(await syncTargetsFromPortfolio(null)).toStrictEqual(
      refused(
        "Another branch was opened before this was saved, so nothing was; make the change again",
      ),
    );
    expect(await readLatest(db, "Retire early")).toMatchObject({ version: 1 });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("syncs into an open scenario without mutating the household or portfolio_files, and refuses decided scenarios", async () => {
    const bytes = samplePortfolioFile();
    const savedAt = new Date("2026-09-14T12:00:00Z");
    await keepAfter(db, { scenario: "", version: 0 }, reference);
    await keepAfter(db, { scenario: "Retire early", version: 0 }, reference);
    await db
      .insert(portfolioFiles)
      .values({
        content: bytes,
        fileName: "northstar.portfolio",
        savedAt,
        version: 1,
      });
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    const { categories: readCategories, portfolios: readPortfolios } =
      readPortfolioTargets(bytes);
    const expected = {
      categories: readCategories,
      importedOn: "2026-09-22",
      portfolios: readPortfolios,
    };

    expect(await syncTargetsFromPortfolio("Retire early")).toStrictEqual(
      saved(expected),
    );
    expect(await readLatest(db, "Retire early")).toStrictEqual({
      household: stamped({ ...reference, targets: expected }),
      version: 2,
    });
    expect(await readLatest(db, "")).toMatchObject({ version: 1 });
    expect((await readLatestPortfolio(db))?.version).toBe(1);
    expect(refresh).toHaveBeenCalledOnce();

    await decideScenario(
      db,
      { scenario: "Retire early", version: 2 },
      { decision: "rejected", reason: null },
    );
    vi.mocked(refresh).mockClear();

    expect(await syncTargetsFromPortfolio("Retire early")).toStrictEqual(
      refused(
        "This scenario is decided, so it takes no edits; make a new scenario from it to change it",
      ),
    );
    expect(await readLatest(db, "Retire early")).toMatchObject({ version: 3 });
    expect(refresh).not.toHaveBeenCalled();
  });
});
