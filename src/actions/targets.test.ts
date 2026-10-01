// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { mappings } from "@/data/cma.fixture";
import { blank, kept as reference, today } from "@/data/household.fixture";
import { targets } from "@/data/targets.fixture";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { importTargets, mapByName, mapCategory } from "./targets";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// The reference categories, read on the day the store is stood up on.
const importedToday = { ...targets, importedOn: "2026-09-15" };

standUp(memory, { today });

describe("importTargets", () => {
  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(importTargets(targets.categories)).rejects.toThrow(
      "redirected",
    );
    expect(await readLatest(db)).toBeNull();
  });

  it("keeps the categories as imported today, draws the page again and hands them back", async () => {
    expect(await importTargets(targets.categories)).toStrictEqual(
      saved(importedToday),
    );
    expect(await readLatest(db)).toStrictEqual({
      household: { ...blank, targets: importedToday },
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps an import over the one the household held, and nothing else", async () => {
    await keepAfter(db, 0, reference);
    const [first, second, ...rest] = targets.categories;
    const moved = [
      ...(first === undefined ? [] : [{ ...first, share: 0.5 }]),
      ...(second === undefined ? [] : [{ ...second, share: 0.1 }]),
      ...rest,
    ];

    await importTargets(moved);

    expect(await readLatest(db)).toStrictEqual({
      household: {
        ...reference,
        targets: { categories: moved, importedOn: "2026-09-15" },
      },
      version: 2,
    });
  });

  // Japan takes five points from the developed world and has no class.
  it("refuses an allocation the CMA's rates cannot be derived from while they are live, saying how to import it, and keeps nothing", async () => {
    const [developed, ...rest] = targets.categories;
    const adding = [
      ...(developed === undefined ? [] : [{ ...developed, share: 0.43 }]),
      ...rest,
      {
        classes: ["Equity"],
        id: "Asset Allocation/Equity/Japan",
        isImplemented: true,
        name: "Japan",
        share: 0.05,
      },
    ];
    await keepAfter(db, 0, { ...reference, rateSet: "cma" });

    expect(await importTargets(adding)).toStrictEqual(
      refused(
        "Japan has no CMA class, so this allocation cannot be imported while the plan runs on the CMA's rates. Choose custom rates, import it and give its new categories a class, then choose From CMA again",
      ),
    );
    expect(await importTargets(targets.categories)).toStrictEqual(
      saved(importedToday),
    );
    expect(await readLatest(db)).toMatchObject({ version: 2 });

    await keepAfter(db, 2, reference);

    expect(await importTargets(adding)).toMatchObject({ kind: "saved" });
  });

  it("refuses categories that do not add up to the whole, and keeps nothing", async () => {
    expect(await importTargets(targets.categories.slice(1))).toStrictEqual(
      refused("A target allocation's categories add up to 100%"),
    );
    expect(await readLatest(db)).toBeNull();
  });

  // Only a bug or a forgery sends a category the reader could not
  // have read, so it fails loudly rather than being refused.
  it("fails on a category the reader could not have sent, and keeps nothing", async () => {
    const unnamed = targets.categories.map((category) => ({
      ...category,
      id: "",
    }));

    await expect(importTargets(unnamed)).rejects.toThrow(z.ZodError);
    expect(await readLatest(db)).toBeNull();
  });
});

describe("mapCategory", () => {
  // FTSE North America, which the reference maps onto nothing, and UK
  // equity, which it maps onto UK large cap equities.
  const [northAmerica, ukEquity] = ["FTSE North America", "UK equity"].map(
    (name) =>
      targets.categories.find((category) => category.name === name)?.id ?? "",
  );

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(
      mapCategory({ asset: "US large cap equities", category: "any" }),
    ).rejects.toThrow("redirected");
    expect(await readLatest(db)).toBeNull();
  });

  it("maps a category onto a class the latest CMA prices, draws the page again and hands every mapping back", async () => {
    await keepAfter(db, 0, reference);
    const mapped = [
      ...mappings,
      { asset: "Global ex-UK large cap equities", category: northAmerica },
    ];

    expect(
      await mapCategory({
        asset: "Global ex-UK large cap equities",
        category: northAmerica ?? "",
      }),
    ).toStrictEqual(saved(mapped));
    expect(await readLatest(db)).toStrictEqual({
      household: { ...reference, mappings: mapped },
      version: 2,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("maps a category over the class it was mapped onto, and onto none", async () => {
    await keepAfter(db, 0, reference);
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
    expect(await readLatest(db)).toMatchObject({
      household: { mappings: others },
      version: 3,
    });
  });

  it("refuses a category the target allocation does not list, and keeps nothing", async () => {
    await keepAfter(db, 0, reference);

    expect(
      await mapCategory({
        asset: "UK cash",
        category: "Asset Allocation/Cash",
      }),
    ).toStrictEqual(refused("A category is mapped once it is imported"));
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });

  it("refuses any category before a target allocation is imported", async () => {
    expect(
      await mapCategory({ asset: null, category: ukEquity ?? "" }),
    ).toStrictEqual(refused("A category is mapped once it is imported"));
    expect(await readLatest(db)).toBeNull();
  });

  it("refuses a class the latest CMA does not price, or any before one is pulled", async () => {
    await keepAfter(db, 0, reference);

    expect(
      await mapCategory({
        asset: "Canada large cap equities",
        category: ukEquity ?? "",
      }),
    ).toStrictEqual(
      refused("The latest CMA prices no Canada large cap equities"),
    );

    await keepAfter(db, 1, { ...reference, cma: null });

    expect(
      await mapCategory({ asset: "UK cash", category: ukEquity ?? "" }),
    ).toStrictEqual(refused("The latest CMA prices no UK cash"));
    expect(await readLatest(db)).toMatchObject({ version: 2 });
  });

  // Only a bug or a forgery sends a class with no name, so it fails
  // loudly rather than being refused.
  it("fails on a class with no name, and keeps nothing", async () => {
    await expect(
      mapCategory({ asset: " ", category: ukEquity ?? "" }),
    ).rejects.toThrow(z.ZodError);
    expect(await readLatest(db)).toBeNull();
  });
});

describe("mapByName", () => {
  // FTSE North America has no class in the reference, and its name
  // suggests US large caps; UK equity is mapped onto Canada, which no
  // vintage prices, and its name suggests UK large caps.
  const idOf = (name: string): string =>
    targets.categories.find((category) => category.name === name)?.id ?? "";
  const northAmerica = idOf("FTSE North America");
  const ukEquity = idOf("UK equity");

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(mapByName()).rejects.toThrow("redirected");
    expect(await readLatest(db)).toBeNull();
  });

  it("maps each category the CMA cannot blend onto its suggestion, draws the page again and hands back what it mapped", async () => {
    const stale = mappings.map((mapping) =>
      mapping.category === ukEquity
        ? { ...mapping, asset: "Canada large cap equities" }
        : mapping,
    );
    await keepAfter(db, 0, { ...reference, mappings: stale });
    const mapped = [
      { asset: "UK large cap equities", category: ukEquity },
      { asset: "US large cap equities", category: northAmerica },
    ];

    expect(await mapByName()).toStrictEqual(saved(mapped));
    expect(await readLatest(db)).toStrictEqual({
      household: {
        ...reference,
        mappings: [
          ...stale.filter(({ category }) => category !== ukEquity),
          ...mapped,
        ],
      },
      version: 2,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("refuses when no category without a class has one suggested, and keeps nothing", async () => {
    await keepAfter(db, 0, {
      ...reference,
      mappings: [
        ...mappings,
        { asset: "US large cap equities", category: northAmerica },
      ],
    });

    expect(await mapByName()).toStrictEqual(
      refused("No category without a class has one suggested"),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });

  it("refuses before a CMA is pulled or a target allocation imported", async () => {
    const refusal = refused(
      "Categories are mapped by name once a CMA is pulled and a target allocation imported",
    );

    expect(await mapByName()).toStrictEqual(refusal);

    await keepAfter(db, 0, { ...reference, cma: null });

    expect(await mapByName()).toStrictEqual(refusal);

    await keepAfter(db, 1, { ...reference, targets: null });

    expect(await mapByName()).toStrictEqual(refusal);
    expect(await readLatest(db)).toMatchObject({ version: 2 });
  });
});
