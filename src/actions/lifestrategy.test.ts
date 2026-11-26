// @vitest-environment node
import type { Mock } from "vitest";

import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import type { Kept } from "@/data/household";

import { cma, mappings } from "@/data/cma.fixture";
import { soundKept } from "@/data/household";
import { blank, kept as reference, today } from "@/data/household.fixture";
import { retargeted } from "@/data/lifestrategy";
import { holdings, lines, vanguardAnswer } from "@/data/lifestrategy.fixture";
import { effectiveSyncedOn } from "@/data/portfolio";
import { stamped, upcast } from "@/data/shapes";
import { portfolios as fixturePortfolios } from "@/data/targets.fixture";
import { getDb } from "@/db/client";
import { decideScenario, keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { keepPortfolioAfter, readLatestPortfolio } from "@/db/portfolio";
import { householdVersions } from "@/db/schema";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { dayOf } from "@/lib/months";
import {
  readPortfolioTargets,
  readTargets,
  reweighted,
} from "@/lib/portfolio-file";
import {
  clientOf,
  portfolioFile,
  reference as referenceTaxonomy,
  samplePortfolioFile,
} from "@/lib/portfolio-file.fixture";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

import { retargetFromLifeStrategy } from "./lifestrategy";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

const referenceFile = portfolioFile(
  clientOf([["Asset Allocation", referenceTaxonomy]]),
);

const referenceTargets = readTargets(referenceFile);

const ftseUsaId =
  referenceTargets.find(({ name }) => name === "FTSE USA")?.id ?? "";

const allMappings = [
  ...mappings,
  { asset: "US large cap equities", category: ftseUsaId },
];

const equityOnlyLines = lines.slice(0, 4);

function vanguardSends(response: Response): Mock<typeof globalThis.fetch> {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("retargetFromLifeStrategy", () => {
  standUp(memory, { today });

  it("checks the session before touching the store or Vanguard", async () => {
    const fetch = vanguardSends(new Response(vanguardAnswer()));
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(
      retargetFromLifeStrategy("9244", { afterVersion: 1, on: null }),
    ).rejects.toThrow("redirected");
    expect(getDb).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses an unknown LifeStrategy fund id without querying the store or Vanguard", async () => {
    const fetch = vanguardSends(new Response(vanguardAnswer()));

    expect(
      await retargetFromLifeStrategy("1234", { afterVersion: 1, on: null }),
    ).toStrictEqual(refused("No LifeStrategy fund goes by that id"));
    expect(getDb).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects forged afterVersion and branch names loudly before contacting Vanguard", async () => {
    const fetch = vanguardSends(new Response(vanguardAnswer()));

    await expect(
      retargetFromLifeStrategy("9244", { afterVersion: 0, on: null }),
    ).rejects.toThrow(ZodError);
    await expect(
      retargetFromLifeStrategy("9244", { afterVersion: 1.5, on: null }),
    ).rejects.toThrow(ZodError);
    await expect(
      retargetFromLifeStrategy("9244", { afterVersion: 1, on: "" }),
    ).rejects.toThrow(ZodError);
    await expect(retargetFromLifeStrategy("9244")).rejects.toThrow(
      "Invalid afterVersion",
    );
    await expect(
      retargetFromLifeStrategy("9244", { on: null }),
    ).rejects.toThrow("Invalid afterVersion");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses cross-tab branch mismatches, decided scenarios, and dropped scenarios before contacting Vanguard", async () => {
    const fetch = vanguardSends(new Response(vanguardAnswer()));
    await keepAfter(db, { scenario: "", version: 0 }, reference);
    await keepAfter(db, { scenario: "Retire early", version: 0 }, reference);

    expect(
      await retargetFromLifeStrategy("9244", {
        afterVersion: 1,
        on: "Retire early",
      }),
    ).toStrictEqual(
      refused(
        "Another branch was opened before this was saved, so nothing was; make the change again",
      ),
    );

    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    expect(
      await retargetFromLifeStrategy("9244", { afterVersion: 1, on: null }),
    ).toStrictEqual(
      refused(
        "Another branch was opened before this was saved, so nothing was; make the change again",
      ),
    );

    await decideScenario(
      db,
      { scenario: "Retire early", version: 1 },
      { decision: "rejected", reason: "Too tight" },
    );

    expect(
      await retargetFromLifeStrategy("9244", { on: "Retire early" }),
    ).toStrictEqual(
      refused(
        "This scenario is decided, so it takes no edits; make a new scenario from it to change it",
      ),
    );

    vi.mocked(openedScenario).mockResolvedValue("Dropped");

    expect(
      await retargetFromLifeStrategy("9244", { on: "Dropped" }),
    ).toStrictEqual(refused("No scenario is kept under that name"));

    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("rethrows unexpected store errors when reading the open branch", async () => {
    const fetch = vanguardSends(new Response(vanguardAnswer()));
    vi.mocked(getDb).mockImplementationOnce(() => {
      throw new Error("db unavailable");
    });

    await expect(
      retargetFromLifeStrategy("9244", { afterVersion: 1, on: null }),
    ).rejects.toThrow("db unavailable");
    expect(fetch).not.toHaveBeenCalled();
  });

  describe("in the household", () => {
    it("refuses before contacting Vanguard when no portfolio file is uploaded, when stale, or when targets cannot be read", async () => {
      const fetch = vanguardSends(new Response(vanguardAnswer()));

      expect(
        await retargetFromLifeStrategy("9244", { afterVersion: 1, on: null }),
      ).toStrictEqual(refused("Upload a portfolio file before making changes"));
      expect(fetch).not.toHaveBeenCalled();

      const withoutTaxonomy = portfolioFile(clientOf([]));
      await keepPortfolioAfter(db, 0, {
        content: withoutTaxonomy,
        fileName: "plain.portfolio",
      });

      expect(
        await retargetFromLifeStrategy("9244", { afterVersion: 2, on: null }),
      ).toStrictEqual(
        refused(
          "The portfolio file changed while this was being saved, so nothing was",
        ),
      );
      expect(refresh).toHaveBeenCalledOnce();
      vi.mocked(refresh).mockClear();

      expect(
        await retargetFromLifeStrategy("9244", { afterVersion: 1, on: null }),
      ).toStrictEqual(
        refused("The file has no Asset Allocation taxonomy, only none"),
      );
      expect(fetch).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it("refuses when Vanguard rejects or sends unreadable holdings, leaving both tables untouched", async () => {
      await keepPortfolioAfter(db, 0, {
        content: referenceFile,
        fileName: "northstar.portfolio",
      });
      await keepAfter(db, { scenario: "", version: 0 }, reference);

      vanguardSends(new Response(null, { status: 403 }));
      expect(
        await retargetFromLifeStrategy("9244", { afterVersion: 1, on: null }),
      ).toStrictEqual(
        refused(
          "Vanguard answered 403 rather than sending what LifeStrategy 80% Equity holds",
        ),
      );

      vanguardSends(new Response("<html>"));
      expect(
        await retargetFromLifeStrategy("9244", { afterVersion: 1, on: null }),
      ).toStrictEqual(refused("Vanguard's answer is not JSON"));

      expect((await readLatestPortfolio(db))?.version).toBe(1);
      expect((await readLatest(db, ""))?.version).toBe(1);
      expect(refresh).not.toHaveBeenCalled();
    });

    it("rewrites the stored portfolio file in place at the custom plan split and auto-syncs household targets", async () => {
      const fetch = vanguardSends(new Response(vanguardAnswer()));
      await keepPortfolioAfter(db, 0, {
        content: referenceFile,
        fileName: "northstar.portfolio",
      });
      await keepAfter(
        db,
        { scenario: "", version: 0 },
        { ...reference, allocation: { stocks: 0.7 }, rateSet: "custom" },
      );

      const answer = await retargetFromLifeStrategy("9244", {
        afterVersion: 1,
        on: null,
      });

      const stored = await readLatestPortfolio(db);
      const savedOn = dayOf(stored?.savedAt ?? today);
      expect(stored?.version).toBe(2);
      expect(stored?.fileName).toBe("northstar.portfolio");
      expect(answer).toStrictEqual(
        saved({
          asOf: "2026-08-31",
          isScenarioOnly: false,
          savedOn,
          split: { stocks: 0.7 },
          version: 2,
        }),
      );
      expect(fetch).toHaveBeenCalledWith(
        expect.any(Request),
        expect.objectContaining({ cache: "no-store" }),
      );
      const expected = readTargets(
        reweighted(
          referenceFile,
          retargeted(referenceTargets, holdings, { stocks: 0.7 }),
        ),
      );
      expect(readTargets(stored?.content ?? new Uint8Array())).toStrictEqual(
        expected,
      );
      const householdRow = await readLatest(db, "");
      expect(householdRow?.version).toBe(2);
      const { categories, latestQuoteDate, latestTransactionDate, portfolios } =
        readPortfolioTargets(stored?.content ?? new Uint8Array());
      expect(
        soundKept(upcast(householdRow?.household)).kept.targets,
      ).toStrictEqual({
        categories,
        importedOn: effectiveSyncedOn({
          latestQuoteDate,
          latestTransactionDate,
          savedOn,
        }),
        portfolios,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("creates the first household version when retargeting before any household row exists", async () => {
      vanguardSends(new Response(vanguardAnswer(equityOnlyLines)));
      await keepPortfolioAfter(db, 0, {
        content: referenceFile,
        fileName: "northstar.portfolio",
      });

      const answer = await retargetFromLifeStrategy("9232", {
        afterVersion: 1,
        on: null,
      });

      const stored = await readLatestPortfolio(db);
      const savedOn = dayOf(stored?.savedAt ?? today);
      expect(stored?.version).toBe(2);
      expect(answer).toStrictEqual(
        saved({
          asOf: "2026-08-31",
          isScenarioOnly: false,
          savedOn,
          split: { stocks: 1 },
          version: 2,
        }),
      );
      const householdRow = await readLatest(db, "");
      expect(householdRow?.version).toBe(1);
      expect(
        soundKept(upcast(householdRow?.household)).kept.targets?.categories,
      ).toStrictEqual(readTargets(stored?.content ?? new Uint8Array()));
    });

    it("derives the split from the fund under CMA rates with no glide path, and from the glide path when one exists", async () => {
      await keepPortfolioAfter(db, 0, {
        content: referenceFile,
        fileName: "northstar.portfolio",
      });
      await keepAfter(
        db,
        { scenario: "", version: 0 },
        {
          ...reference,
          cma: { latest: cma, previous: null },
          glide: [],
          mappings: allMappings,
          rateSet: "cma",
        },
      );

      const fetchFirst = vanguardSends(new Response(vanguardAnswer()));
      const withoutGlide = await retargetFromLifeStrategy("9244", {
        afterVersion: 1,
        on: null,
      });

      const firstStored = await readLatestPortfolio(db);
      expect(withoutGlide).toStrictEqual(
        saved({
          asOf: "2026-08-31",
          isScenarioOnly: false,
          savedOn: dayOf(firstStored?.savedAt ?? today),
          split: { stocks: 0.8 },
          version: 2,
        }),
      );
      const [askedFirst] = fetchFirst.mock.calls[0] ?? [];
      const firstBody: unknown =
        askedFirst instanceof Request
          ? JSON.parse(await askedFirst.text())
          : null;
      expect(firstBody).toHaveProperty("variables", { portIds: ["9244"] });

      // Add a glide path holding 25% bonds now (75% stocks).
      const afterFirst = soundKept(
        upcast((await readLatest(db, ""))?.household),
      ).kept;
      await keepAfter(
        db,
        { scenario: "", version: 2 },
        { ...afterFirst, glide: [{ age: 30, bonds: 0.25 }] },
      );

      vanguardSends(new Response(vanguardAnswer()));
      const withGlide = await retargetFromLifeStrategy("9244", {
        afterVersion: 2,
        on: null,
      });

      const secondStored = await readLatestPortfolio(db);
      expect(withGlide).toStrictEqual(
        saved({
          asOf: "2026-08-31",
          isScenarioOnly: false,
          savedOn: dayOf(secondStored?.savedAt ?? today),
          split: { stocks: 0.75 },
          version: 3,
        }),
      );
      expect(
        readTargets(secondStored?.content ?? new Uint8Array()),
      ).toStrictEqual(
        readTargets(
          reweighted(
            firstStored?.content ?? new Uint8Array(),
            retargeted(
              readTargets(firstStored?.content ?? new Uint8Array()),
              holdings,
              { stocks: 0.75 },
            ),
          ),
        ),
      );
    });

    it("refuses before committing portfolio_files when live CMA rules reject the retargeted weights", async () => {
      vanguardSends(new Response(vanguardAnswer()));
      await keepPortfolioAfter(db, 0, {
        content: referenceFile,
        fileName: "northstar.portfolio",
      });
      // Default fixture mappings leave FTSE USA unmapped, which gets 20% after retargeting.
      await keepAfter(
        db,
        { scenario: "", version: 0 },
        {
          ...reference,
          cma: { latest: cma, previous: null },
          mappings,
          rateSet: "cma",
        },
      );

      expect(
        await retargetFromLifeStrategy("9244", { afterVersion: 1, on: null }),
      ).toStrictEqual(
        refused(
          "FTSE USA has no CMA class, so this allocation cannot be retargeted while the plan runs on the CMA's rates. Choose custom rates, retarget it and give its new categories a class, then choose From CMA again",
        ),
      );

      const stored = await readLatestPortfolio(db);
      expect(stored?.version).toBe(1);
      expect(stored?.content).toStrictEqual(referenceFile);
      expect((await readLatest(db, ""))?.version).toBe(1);
      expect(refresh).not.toHaveBeenCalled();
    });

    it("propagates syncWarning when household auto-sync conflicts after portfolio_files commits", async () => {
      vanguardSends(new Response(vanguardAnswer()));
      await keepPortfolioAfter(db, 0, {
        content: referenceFile,
        fileName: "northstar.portfolio",
      });
      await keepAfter(
        db,
        { scenario: "", version: 0 },
        { ...reference, allocation: { stocks: 0.7 }, rateSet: "custom" },
      );

      const insert = db.insert.bind(db);
      let racedFirst: Promise<unknown> = Promise.resolve();
      let racedSecond: Promise<unknown> = Promise.resolve();
      const insertSpy = vi
        .spyOn(db, "insert")
        .mockImplementationOnce((table) => insert(table))
        .mockImplementationOnce((table) => {
          racedFirst = insert(householdVersions)
            .values({
              household: stamped({ ...reference, ages: { ends: 95 } }),
              scenario: "",
              version: 2,
            })
            .execute();
          return insert(table);
        })
        .mockImplementationOnce((table) => {
          racedSecond = insert(householdVersions)
            .values({
              household: stamped({ ...reference, ages: { ends: 96 } }),
              scenario: "",
              version: 3,
            })
            .execute();
          return insert(table);
        });

      const answer = await retargetFromLifeStrategy("9244", {
        afterVersion: 1,
        on: null,
      });
      await Promise.all([racedFirst, racedSecond]);
      insertSpy.mockRestore();

      const stored = await readLatestPortfolio(db);
      expect(stored?.version).toBe(2);
      expect(answer).toStrictEqual(
        saved({
          asOf: "2026-08-31",
          isScenarioOnly: false,
          savedOn: dayOf(stored?.savedAt ?? today),
          split: { stocks: 0.7 },
          syncWarning:
            "The household changed while this was being saved, so nothing was",
          version: 2,
        }),
      );
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("uses the latest household rateSet and allocation split when they change while Vanguard fetch is in flight", async () => {
      await keepPortfolioAfter(db, 0, {
        content: referenceFile,
        fileName: "northstar.portfolio",
      });
      await keepAfter(
        db,
        { scenario: "", version: 0 },
        { ...reference, allocation: { stocks: 0.7 }, rateSet: "custom" },
      );

      // While Vanguard fetch is in flight, switch the household from
      // custom 70% stocks to CMA rates with no glide path (so the fund's
      // own 80% stocks split applies instead of 70%).
      const racingFetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => {
          await keepAfter(
            db,
            { scenario: "", version: 1 },
            {
              ...reference,
              cma: { latest: cma, previous: null },
              glide: [],
              mappings: allMappings,
              rateSet: "cma",
            },
          );
          return new Response(vanguardAnswer());
        });
      vi.stubGlobal("fetch", racingFetch);

      const answer = await retargetFromLifeStrategy("9244", {
        afterVersion: 1,
        on: null,
      });

      const stored = await readLatestPortfolio(db);
      expect(answer).toStrictEqual(
        saved({
          asOf: "2026-08-31",
          isScenarioOnly: false,
          savedOn: dayOf(stored?.savedAt ?? today),
          split: { stocks: 0.8 },
          version: 2,
        }),
      );
      expect(readTargets(stored?.content ?? new Uint8Array())).toStrictEqual(
        readTargets(
          reweighted(
            referenceFile,
            retargeted(referenceTargets, holdings, null),
          ),
        ),
      );
    });
  });

  describe("in a scenario", () => {
    it("refuses before contacting Vanguard when the scenario has no targets, and refuses if targets clear mid-fetch", async () => {
      const fetch = vanguardSends(new Response(vanguardAnswer()));
      await keepAfter(
        db,
        { scenario: "Retire early", version: 0 },
        { ...blank, targets: null },
      );
      vi.mocked(openedScenario).mockResolvedValue("Retire early");

      expect(
        await retargetFromLifeStrategy("9244", { on: "Retire early" }),
      ).toStrictEqual(refused("Sync from Portfolio before retargeting"));
      expect(fetch).not.toHaveBeenCalled();

      // Now seed targets, then clear them while Vanguard is in flight.
      await keepAfter(db, { scenario: "Retire early", version: 1 }, reference);
      const racingFetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => {
          await keepAfter(
            db,
            { scenario: "Retire early", version: 2 },
            { ...reference, targets: null },
          );
          return new Response(vanguardAnswer());
        });
      vi.stubGlobal("fetch", racingFetch);

      expect(
        await retargetFromLifeStrategy("9244", { on: "Retire early" }),
      ).toStrictEqual(refused("Sync from Portfolio before retargeting"));
      expect((await readLatest(db, "Retire early"))?.version).toBe(3);
    });

    it("refuses when Vanguard rejects in a scenario", async () => {
      await keepAfter(db, { scenario: "Retire early", version: 0 }, reference);
      vi.mocked(openedScenario).mockResolvedValue("Retire early");
      vanguardSends(new Response(null, { status: 503 }));

      expect(
        await retargetFromLifeStrategy("9244", { on: "Retire early" }),
      ).toStrictEqual(
        refused(
          "Vanguard answered 503 rather than sending what LifeStrategy 80% Equity holds",
        ),
      );
      expect((await readLatest(db, "Retire early"))?.version).toBe(1);
    });

    it("updates only the scenario targets using in-memory basis-point rounding when the stored file matches, leaving portfolio_files untouched", async () => {
      vanguardSends(new Response(vanguardAnswer()));
      await keepPortfolioAfter(db, 0, {
        content: referenceFile,
        fileName: "northstar.portfolio",
      });
      await keepAfter(db, { scenario: "", version: 0 }, reference);

      // Include a 0%-share category absent from the stored file plus
      // accounts/portfolios bookkeeping to verify everything else stays untouched.
      const extraCategory = {
        accounts: [{ name: "Brokerage", value: 250 }],
        classes: ["Cash"],
        id: "Asset Allocation/Cash/Extra",
        isImplemented: true,
        name: "Extra reserve",
        share: 0,
        value: 250,
      };
      const scenarioKept: Kept = {
        ...reference,
        allocation: { stocks: 0.7 },
        rateSet: "custom",
        targets: {
          categories: [...referenceTargets, extraCategory],
          importedOn: "2026-09-07",
          portfolios: fixturePortfolios,
        },
      };
      await keepAfter(
        db,
        { scenario: "Retire early", version: 0 },
        scenarioKept,
      );
      vi.mocked(openedScenario).mockResolvedValue("Retire early");

      const answer = await retargetFromLifeStrategy("9244", {
        on: "Retire early",
      });

      expect(answer).toStrictEqual(
        saved({
          asOf: "2026-08-31",
          isScenarioOnly: true,
          split: { stocks: 0.7 },
        }),
      );
      // Household and portfolio_files are completely untouched.
      const storedAfter = await readLatestPortfolio(db);
      expect(storedAfter?.version).toBe(1);
      expect(storedAfter?.content).toStrictEqual(referenceFile);
      expect((await readLatest(db, ""))?.version).toBe(1);

      const expectedRounded = new Map(
        readTargets(
          reweighted(
            referenceFile,
            retargeted(referenceTargets, holdings, { stocks: 0.7 }),
          ),
        ).map(({ id, share }) => [id, share]),
      );
      const scenarioAfter = soundKept(
        upcast((await readLatest(db, "Retire early"))?.household),
      ).kept;
      expect(scenarioAfter.targets).toStrictEqual({
        categories: [...referenceTargets, extraCategory].map((category) => ({
          ...category,
          share: expectedRounded.get(category.id) ?? 0,
        })),
        importedOn: "2026-09-07",
        portfolios: fixturePortfolios,
      });
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("falls back to direct shares in a scenario when no stored file exists, when it is unreadable, or when a positive-share category is absent", async () => {
      const scenarioKept: Kept = {
        ...reference,
        allocation: { stocks: 0.7 },
        rateSet: "custom",
        targets: {
          categories: referenceTargets,
          importedOn: "2026-09-07",
          portfolios: fixturePortfolios,
        },
      };
      await keepAfter(
        db,
        { scenario: "Retire early", version: 0 },
        scenarioKept,
      );
      vi.mocked(openedScenario).mockResolvedValue("Retire early");

      const expectedDirect = retargeted(referenceTargets, holdings, {
        stocks: 0.7,
      });
      const expectedCategories = referenceTargets.map((category) => ({
        ...category,
        share: expectedDirect.get(category.id) ?? 0,
      }));

      // 1. No stored portfolio file at all (options omitted to cover on === undefined).
      vanguardSends(new Response(vanguardAnswer()));
      expect(await retargetFromLifeStrategy("9244")).toStrictEqual(
        saved({
          asOf: "2026-08-31",
          isScenarioOnly: true,
          split: { stocks: 0.7 },
        }),
      );
      expect(
        soundKept(upcast((await readLatest(db, "Retire early"))?.household))
          .kept.targets?.categories,
      ).toStrictEqual(expectedCategories);

      // 2. Stored file without an Asset Allocation taxonomy (readTargets refused).
      await keepPortfolioAfter(db, 0, {
        content: portfolioFile(clientOf([])),
        fileName: "plain.portfolio",
      });
      vanguardSends(new Response(vanguardAnswer()));
      expect(
        await retargetFromLifeStrategy("9244", { on: "Retire early" }),
      ).toStrictEqual(
        saved({
          asOf: "2026-08-31",
          isScenarioOnly: true,
          split: { stocks: 0.7 },
        }),
      );
      expect(
        soundKept(upcast((await readLatest(db, "Retire early"))?.household))
          .kept.targets?.categories,
      ).toStrictEqual(expectedCategories);

      // 3. Stored file whose taxonomy does not contain the positive-share categories.
      await keepPortfolioAfter(db, 1, {
        content: samplePortfolioFile(),
        fileName: "other.portfolio",
      });
      vanguardSends(new Response(vanguardAnswer()));
      expect(
        await retargetFromLifeStrategy("9244", { on: "Retire early" }),
      ).toStrictEqual(
        saved({
          asOf: "2026-08-31",
          isScenarioOnly: true,
          split: { stocks: 0.7 },
        }),
      );
      expect(
        soundKept(upcast((await readLatest(db, "Retire early"))?.household))
          .kept.targets?.categories,
      ).toStrictEqual(expectedCategories);
      expect((await readLatestPortfolio(db))?.version).toBe(2);
    });

    it("refuses a scenario retarget when live CMA rules reject an unmapped category", async () => {
      vanguardSends(new Response(vanguardAnswer()));
      await keepAfter(
        db,
        { scenario: "Retire early", version: 0 },
        {
          ...reference,
          cma: { latest: cma, previous: null },
          mappings,
          rateSet: "cma",
        },
      );
      vi.mocked(openedScenario).mockResolvedValue("Retire early");

      expect(
        await retargetFromLifeStrategy("9244", { on: "Retire early" }),
      ).toStrictEqual(
        refused(
          "FTSE USA has no CMA class, so this allocation cannot be retargeted while the plan runs on the CMA's rates. Choose custom rates, retarget it and give its new categories a class, then choose From CMA again",
        ),
      );
      expect((await readLatest(db, "Retire early"))?.version).toBe(1);
      expect(refresh).not.toHaveBeenCalled();
    });

    it("uses the latest scenario rateSet and allocation split when they change while Vanguard fetch is in flight", async () => {
      const scenarioKept: Kept = {
        ...reference,
        allocation: { stocks: 0.7 },
        rateSet: "custom",
        targets: {
          categories: referenceTargets,
          importedOn: "2026-09-07",
          portfolios: fixturePortfolios,
        },
      };
      await keepAfter(
        db,
        { scenario: "Retire early", version: 0 },
        scenarioKept,
      );
      vi.mocked(openedScenario).mockResolvedValue("Retire early");

      // While Vanguard fetch is in flight, update the scenario's custom
      // split from 70% stocks to 60% stocks.
      const racingFetch = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => {
          await keepAfter(
            db,
            { scenario: "Retire early", version: 1 },
            { ...scenarioKept, allocation: { stocks: 0.6 }, rateSet: "custom" },
          );
          return new Response(vanguardAnswer());
        });
      vi.stubGlobal("fetch", racingFetch);

      const answer = await retargetFromLifeStrategy("9244", {
        on: "Retire early",
      });

      expect(answer).toStrictEqual(
        saved({
          asOf: "2026-08-31",
          isScenarioOnly: true,
          split: { stocks: 0.6 },
        }),
      );
      const expectedDirect = retargeted(referenceTargets, holdings, {
        stocks: 0.6,
      });
      expect(
        soundKept(upcast((await readLatest(db, "Retire early"))?.household))
          .kept.targets?.categories,
      ).toStrictEqual(
        referenceTargets.map((category) => ({
          ...category,
          share: expectedDirect.get(category.id) ?? 0,
        })),
      );
    });

    it("refuses a scenario retarget called without options.on if the scenario cookie closes or switches while Vanguard fetch is in flight", async () => {
      await keepAfter(db, { scenario: "", version: 0 }, reference);
      await keepAfter(db, { scenario: "Retire early", version: 0 }, reference);
      await keepAfter(db, { scenario: "Move house", version: 0 }, reference);

      // 1. Cookie closes to the household mid-fetch.
      vi.mocked(openedScenario).mockResolvedValue("Retire early");
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
          await Promise.resolve();
          vi.mocked(openedScenario).mockResolvedValue(null);
          return new Response(vanguardAnswer());
        }),
      );

      expect(await retargetFromLifeStrategy("9244")).toStrictEqual(
        refused(
          "Another branch was opened before this was saved, so nothing was; make the change again",
        ),
      );
      expect((await readLatest(db, ""))?.version).toBe(1);
      expect((await readLatest(db, "Retire early"))?.version).toBe(1);

      // 2. Cookie switches to another scenario mid-fetch.
      vi.mocked(openedScenario).mockResolvedValue("Retire early");
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
          await Promise.resolve();
          vi.mocked(openedScenario).mockResolvedValue("Move house");
          return new Response(vanguardAnswer());
        }),
      );

      expect(await retargetFromLifeStrategy("9244")).toStrictEqual(
        refused(
          "Another branch was opened before this was saved, so nothing was; make the change again",
        ),
      );
      expect((await readLatest(db, "Retire early"))?.version).toBe(1);
      expect((await readLatest(db, "Move house"))?.version).toBe(1);
      expect(refresh).not.toHaveBeenCalled();
    });
  });
});
