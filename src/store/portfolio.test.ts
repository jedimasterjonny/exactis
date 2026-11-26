// @vitest-environment node
import { strToU8 } from "fflate";
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { soundKept } from "@/data/household";
import { kept as reference, today } from "@/data/household.fixture";
import { maxPortfolioBytes, portfolioTooLarge } from "@/data/portfolio";
import { stamped, upcast } from "@/data/shapes";
import { getDb } from "@/db/client";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { readLatestPortfolio } from "@/db/portfolio";
import { householdVersions, portfolioFiles } from "@/db/schema";
import { standUp } from "@/db/store.fixture";
import { Refusal, refused, saved } from "@/lib/answer";
import { dayOf } from "@/lib/months";
import {
  appendAccount,
  appendTransaction,
  readPortfolioSnapshot,
  readPortfolioTargets,
  updateQuotes,
} from "@/lib/portfolio-file";
import {
  clientOf,
  portfolioFile,
  samplePortfolioFile,
} from "@/lib/portfolio-file.fixture";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

import type { OwnedPortfolio } from "./portfolio";

import { takeConsoleOutput } from "../../vitest.setup";
import {
  amendPortfolio,
  getPortfolio,
  readStoredPortfolio,
  storePortfolio,
} from "./portfolio";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

describe("the portfolio store", () => {
  standUp(memory, { today });

  describe("getPortfolio", () => {
    it("reads nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(getPortfolio()).rejects.toThrow("redirected");
      expect(getDb).not.toHaveBeenCalled();
    });

    it("returns null before any portfolio file is stored", async () => {
      expect(await getPortfolio()).toBeNull();
    });

    it("parses the latest stored file server-side with UK savedOn and no raw bytes", async () => {
      const bytes = samplePortfolioFile();
      // 23:30 UTC in British Summer Time falls on the next UK calendar day.
      const summerLate = new Date("2026-07-01T23:30:00Z");
      await db
        .insert(portfolioFiles)
        .values({
          content: bytes,
          fileName: "northstar.portfolio",
          savedAt: summerLate,
          version: 1,
        });

      const owned: null | OwnedPortfolio = await getPortfolio();
      expect(owned).toStrictEqual({
        savedOn: "2026-07-02",
        snapshot: readPortfolioSnapshot(bytes, "northstar.portfolio"),
        version: 1,
      });
      expect(owned).not.toHaveProperty("content");
    });

    it("stays readable while a scenario is open and returns the latest version when multiple exist", async () => {
      const firstBytes = samplePortfolioFile("GBP");
      const secondBytes = samplePortfolioFile("EUR");
      await db.insert(portfolioFiles).values([
        {
          content: firstBytes,
          fileName: "northstar-v1.portfolio",
          savedAt: new Date("2026-09-20T12:00:00Z"),
          version: 1,
        },
        {
          content: secondBytes,
          fileName: "northstar-v2.portfolio",
          savedAt: new Date("2026-09-25T12:00:00Z"),
          version: 2,
        },
      ]);
      vi.mocked(openedScenario).mockResolvedValue("Retire early");

      expect(await getPortfolio()).toStrictEqual({
        savedOn: "2026-09-25",
        snapshot: readPortfolioSnapshot(secondBytes, "northstar-v2.portfolio"),
        version: 2,
      });
    });
  });

  describe("readStoredPortfolio", () => {
    it("reads nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(readStoredPortfolio()).rejects.toThrow("redirected");
      expect(getDb).not.toHaveBeenCalled();
    });

    it("returns null before any portfolio file is stored", async () => {
      expect(await readStoredPortfolio()).toBeNull();
    });

    it("returns the exact latest stored bytes even while a scenario is open", async () => {
      const bytes = samplePortfolioFile();
      await storePortfolio(0, {
        content: bytes,
        fileName: "northstar.portfolio",
      });
      vi.mocked(openedScenario).mockResolvedValue("Retire early");

      const stored = await readStoredPortfolio();
      expect(stored).toStrictEqual({
        content: bytes,
        fileName: "northstar.portfolio",
        savedAt: expect.any(Date) as unknown,
        version: 1,
      });
    });
  });

  describe("storePortfolio", () => {
    it("validates, stores, replaces, and refreshes on valid binary files", async () => {
      const firstBytes = samplePortfolioFile("GBP");
      const first = await storePortfolio(0, {
        content: firstBytes,
        fileName: "northstar.portfolio",
      });
      const storedFirst = await readLatestPortfolio(db);
      expect(storedFirst).not.toBeNull();
      expect(storedFirst?.content).toStrictEqual(firstBytes);
      expect(first).toStrictEqual(
        saved({
          fileName: "northstar.portfolio",
          savedOn: dayOf(storedFirst?.savedAt ?? today),
          version: 1,
        }),
      );
      expect(refresh).toHaveBeenCalledTimes(1);

      const secondBytes = samplePortfolioFile("EUR");
      const second = await storePortfolio(1, {
        content: secondBytes,
        fileName: "northstar-euro.portfolio",
      });
      const storedSecond = await readLatestPortfolio(db);
      expect(storedSecond?.content).toStrictEqual(secondBytes);
      expect(second).toStrictEqual(
        saved({
          fileName: "northstar-euro.portfolio",
          savedOn: dayOf(storedSecond?.savedAt ?? today),
          version: 2,
        }),
      );
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("refuses XML, encrypted, and corrupt files without writing or refreshing", async () => {
      const xmlBytes = new Uint8Array(strToU8("<client/>"));
      const encryptedBytes = new Uint8Array(strToU8("PORTFOLIO-locked"));
      const corruptBytes = new Uint8Array([0x01, 0x02, 0x03, 0x04]);

      expect(
        await storePortfolio(0, {
          content: xmlBytes,
          fileName: "xml.portfolio",
        }),
      ).toStrictEqual(
        refused(
          "The file is saved as XML, and only a Portfolio Performance file saved in binary can be read",
        ),
      );
      expect(
        await storePortfolio(0, {
          content: encryptedBytes,
          fileName: "locked.portfolio",
        }),
      ).toStrictEqual(
        refused(
          "The file is encrypted, and only a Portfolio Performance file saved in binary without a password can be read",
        ),
      );
      expect(
        await storePortfolio(0, {
          content: corruptBytes,
          fileName: "corrupt.portfolio",
        }),
      ).toStrictEqual(
        refused(
          "The file is not a zip, as a Portfolio Performance file saved in binary is",
        ),
      );
      expect(await readLatestPortfolio(db)).toBeNull();
      expect(refresh).not.toHaveBeenCalled();
    });

    it("refuses writes while a scenario is open", async () => {
      vi.mocked(openedScenario).mockResolvedValue("Retire early");

      expect(
        await storePortfolio(0, {
          content: samplePortfolioFile(),
          fileName: "northstar.portfolio",
        }),
      ).toStrictEqual(
        refused("Leave the scenario to upload or replace the portfolio file"),
      );
      expect(await readLatestPortfolio(db)).toBeNull();
      expect(refresh).not.toHaveBeenCalled();
    });

    it("refuses files larger than 4 MB before parsing or writing", async () => {
      expect(
        await storePortfolio(0, {
          content: new Uint8Array(maxPortfolioBytes + 1),
          fileName: "huge.portfolio",
        }),
      ).toStrictEqual(refused(portfolioTooLarge));
      expect(await readLatestPortfolio(db)).toBeNull();
      expect(refresh).not.toHaveBeenCalled();
    });

    it("refuses stale saves and calls refresh so the page advances to the latest version", async () => {
      const bytes = samplePortfolioFile();
      await storePortfolio(0, {
        content: bytes,
        fileName: "northstar.portfolio",
      });
      vi.mocked(refresh).mockClear();

      expect(
        await storePortfolio(0, {
          content: samplePortfolioFile("USD"),
          fileName: "stale.portfolio",
        }),
      ).toStrictEqual(
        refused(
          "The portfolio file changed while this was being saved, so nothing was",
        ),
      );
      expect(refresh).toHaveBeenCalledOnce();
      expect(await readLatestPortfolio(db)).toMatchObject({
        fileName: "northstar.portfolio",
        version: 1,
      });
    });

    it("rethrows unexpected database failures without calling refresh", async () => {
      vi.mocked(getDb).mockImplementation(() => {
        throw new Error("connection lost");
      });

      await expect(
        storePortfolio(0, {
          content: samplePortfolioFile(),
          fileName: "northstar.portfolio",
        }),
      ).rejects.toThrow("connection lost");
      expect(refresh).not.toHaveBeenCalled();
    });

    it("writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

      await expect(
        storePortfolio(0, {
          content: samplePortfolioFile(),
          fileName: "northstar.portfolio",
        }),
      ).rejects.toThrow("redirected");
      expect(await readLatestPortfolio(db)).toBeNull();
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe("amendPortfolio", () => {
    it("reads the latest file, mutates it, verifies readability, persists the next version, and refreshes", async () => {
      await storePortfolio(0, {
        content: samplePortfolioFile(),
        fileName: "northstar.portfolio",
      });
      vi.mocked(refresh).mockClear();

      const answer = await amendPortfolio(1, (stored) => {
        const { content, id } = appendAccount(
          stored.content,
          { currency: "GBP", kind: "cash", name: "Savings Pot" },
          { uuid: () => "cash-savings" },
        );
        return { content, result: { id } };
      });

      const latest = await readLatestPortfolio(db);
      expect(latest?.version).toBe(2);
      expect(latest?.fileName).toBe("northstar.portfolio");
      expect(answer).toStrictEqual(
        saved({
          id: "cash-savings",
          savedOn: dayOf(latest?.savedAt ?? today),
          version: 2,
        }),
      );
      expect(refresh).toHaveBeenCalledOnce();
      expect(
        readPortfolioSnapshot(
          latest?.content ?? new Uint8Array(),
          "northstar.portfolio",
        ).cashAccounts.map((a) => a.name),
      ).toContain("Savings Pot");
    });

    it("refuses mutations without an uploaded file or while a scenario is open", async () => {
      expect(
        await amendPortfolio(1, () => ({
          content: samplePortfolioFile(),
          result: { id: "x" },
        })),
      ).toStrictEqual(refused("Upload a portfolio file before making changes"));
      expect(refresh).not.toHaveBeenCalled();

      vi.mocked(openedScenario).mockResolvedValue("Retire early");
      expect(
        await amendPortfolio(1, () => ({
          content: samplePortfolioFile(),
          result: { id: "x" },
        })),
      ).toStrictEqual(
        refused("Leave the scenario to update the portfolio file"),
      );
      expect(refresh).not.toHaveBeenCalled();
    });

    it("refuses stale versions before mutation and on concurrent race after mutation, refreshing on both", async () => {
      await storePortfolio(0, {
        content: samplePortfolioFile(),
        fileName: "northstar.portfolio",
      });
      await storePortfolio(1, {
        content: samplePortfolioFile("EUR"),
        fileName: "northstar-v2.portfolio",
      });
      vi.mocked(refresh).mockClear();

      // Pre-mutation version mismatch skips mutate and refreshes immediately.
      const mutateSpy = vi.fn();
      expect(await amendPortfolio(1, mutateSpy)).toStrictEqual(
        refused(
          "The portfolio file changed while this was being saved, so nothing was",
        ),
      );
      expect(mutateSpy).not.toHaveBeenCalled();
      expect(refresh).toHaveBeenCalledTimes(1);

      // Post-mutation race: enqueue another version onto PGlite before keepPortfolioAfter runs.
      let raced: Promise<unknown> = Promise.resolve();
      expect(
        await amendPortfolio(2, (stored) => {
          raced = db
            .insert(portfolioFiles)
            .values({
              content: samplePortfolioFile("USD"),
              fileName: "raced.portfolio",
              savedAt: new Date("2026-09-25T12:00:00Z"),
              version: 3,
            })
            .execute();
          return { content: stored.content, result: { id: "late" } };
        }),
      ).toStrictEqual(
        refused(
          "The portfolio file changed while this was being saved, so nothing was",
        ),
      );
      await raced;
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("refuses oversized mutated files, unreadable mutated bytes, and domain Refusals without refreshing", async () => {
      await storePortfolio(0, {
        content: samplePortfolioFile(),
        fileName: "northstar.portfolio",
      });
      vi.mocked(refresh).mockClear();

      expect(
        await amendPortfolio(1, () => ({
          content: new Uint8Array(maxPortfolioBytes + 1),
          result: { id: "huge" },
        })),
      ).toStrictEqual(refused(portfolioTooLarge));

      expect(
        await amendPortfolio(1, () => ({
          content: new Uint8Array([0x01, 0x02, 0x03]),
          result: { id: "corrupt" },
        })),
      ).toStrictEqual(
        refused(
          "The file is not a zip, as a Portfolio Performance file saved in binary is",
        ),
      );

      expect(
        await amendPortfolio(1, () => {
          throw new Refusal("Domain refusal");
        }),
      ).toStrictEqual(refused("Domain refusal"));

      expect(refresh).not.toHaveBeenCalled();
      expect((await readLatestPortfolio(db))?.version).toBe(1);
    });

    it("rethrows unexpected errors and writes nothing without a session", async () => {
      vi.mocked(requireSession).mockRejectedValueOnce(new Error("redirected"));
      await expect(
        amendPortfolio(1, () => ({
          content: samplePortfolioFile(),
          result: { id: "x" },
        })),
      ).rejects.toThrow("redirected");

      vi.mocked(getDb).mockImplementationOnce(() => {
        throw new Error("db down");
      });
      await expect(
        amendPortfolio(1, () => ({
          content: samplePortfolioFile(),
          result: { id: "x" },
        })),
      ).rejects.toThrow("db down");
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe("auto-syncing household targets", () => {
    it("creates household version 1 on upload when no household row exists yet", async () => {
      const bytes = samplePortfolioFile();
      const answer = await storePortfolio(0, {
        content: bytes,
        fileName: "northstar.portfolio",
      });

      const stored = await readLatestPortfolio(db);
      const savedOn = dayOf(stored?.savedAt ?? today);
      expect(answer).toStrictEqual(
        saved({ fileName: "northstar.portfolio", savedOn, version: 1 }),
      );

      const householdRow = await readLatest(db, "");
      expect(householdRow?.version).toBe(1);
      const { kept } = soundKept(upcast(householdRow?.household));
      expect(kept.asOf).toStrictEqual({ month: 7, year: 2026 });
      const { categories, portfolios } = readPortfolioTargets(bytes);
      expect(kept.targets).toStrictEqual({
        categories,
        importedOn: "2026-09-22",
        portfolios,
      });
    });

    it("updates household targets on upload when a household already exists", async () => {
      await keepAfter(db, { scenario: "", version: 0 }, reference);
      const bytes = samplePortfolioFile();

      const answer = await storePortfolio(0, {
        content: bytes,
        fileName: "northstar.portfolio",
      });

      const stored = await readLatestPortfolio(db);
      const savedOn = dayOf(stored?.savedAt ?? today);
      expect(answer).toStrictEqual(
        saved({ fileName: "northstar.portfolio", savedOn, version: 1 }),
      );

      const householdRow = await readLatest(db, "");
      expect(householdRow?.version).toBe(2);
      const { kept } = soundKept(upcast(householdRow?.household));
      expect(kept.accounts).toStrictEqual(reference.accounts);
      const { categories, portfolios } = readPortfolioTargets(bytes);
      expect(kept.targets).toStrictEqual({
        categories,
        importedOn: "2026-09-22",
        portfolios,
      });
    });

    it("supports async mutate in amendPortfolio and auto-syncs updated holdings, cash, and paid history", async () => {
      await storePortfolio(0, {
        content: samplePortfolioFile(),
        fileName: "northstar.portfolio",
      });

      const afterDeposit = await amendPortfolio(1, async (stored) => {
        await Promise.resolve();
        const { content, id } = appendTransaction(
          stored.content,
          {
            accountId: "cash-isa",
            amount: 500,
            currency: "GBP",
            date: "2026-09-15",
            fees: 0,
            shares: 0,
            taxes: 0,
            type: "deposit",
          },
          { now: today, uuid: () => "tx-deposit" },
        );
        return { content, result: { id } };
      });

      const afterQuotes = await amendPortfolio(2, (stored) => {
        const { content, updatedCount } = updateQuotes(
          stored.content,
          {
            date: "2026-09-25",
            quotes: [{ price: 150, securityId: "sec-world" }],
          },
          { now: today },
        );
        return { content, result: { updatedCount } };
      });

      const latestPortfolio = await readLatestPortfolio(db);
      const savedOn = dayOf(latestPortfolio?.savedAt ?? today);
      expect(afterDeposit).toStrictEqual(
        saved({ id: "tx-deposit", savedOn, version: 2 }),
      );
      expect(afterQuotes).toStrictEqual(
        saved({ savedOn, updatedCount: 1, version: 3 }),
      );

      const householdRow = await readLatest(db, "");
      expect(householdRow?.version).toBe(3);
      const { kept } = soundKept(upcast(householdRow?.household));
      const { categories, portfolios } = readPortfolioTargets(
        latestPortfolio?.content ?? new Uint8Array(),
      );
      expect(kept.targets).toStrictEqual({
        categories,
        importedOn: "2026-09-25",
        portfolios,
      });
      expect(kept.targets?.categories[0]?.value).toBe(1500);
      expect(kept.targets?.portfolios?.[0]?.cash).toBe(1250);
    });

    it("short-circuits same-day equivalent targets without a duplicate row, and advances importedOn on a new day", async () => {
      const bytes = samplePortfolioFile();
      const { categories, portfolios } = readPortfolioTargets(bytes);
      await storePortfolio(0, {
        content: bytes,
        fileName: "northstar.portfolio",
      });
      expect((await readLatest(db, ""))?.version).toBe(1);

      // Re-uploading structurally identical targets with the same data date skips writing.
      await storePortfolio(1, {
        content: samplePortfolioFile("EUR"),
        fileName: "northstar-same.portfolio",
      });
      expect((await readLatest(db, ""))?.version).toBe(1);

      // A household with identical targets dated earlier advances importedOn to the file's data date.
      const { kept: firstKept } = soundKept(
        upcast((await readLatest(db, ""))?.household),
      );
      await keepAfter(
        db,
        { scenario: "", version: 1 },
        {
          ...firstKept,
          targets: { categories, importedOn: "2026-09-01", portfolios },
        },
      );
      const answer = await storePortfolio(2, {
        content: bytes,
        fileName: "northstar-new-day.portfolio",
      });
      const stored = await readLatestPortfolio(db);
      const savedOn = dayOf(stored?.savedAt ?? today);
      expect(answer).toStrictEqual(
        saved({ fileName: "northstar-new-day.portfolio", savedOn, version: 3 }),
      );

      const householdRow = await readLatest(db, "");
      expect(householdRow?.version).toBe(3);
      expect(
        soundKept(upcast(householdRow?.household)).kept.targets?.importedOn,
      ).toBe("2026-09-22");
    });

    it("stamps an old-dated file with its data date rather than upload date, falling back to savedOn when undated", async () => {
      // Epoch day 20_162 is 2025-03-15, well before the upload day.
      const oldDated = portfolioFile([
        [1, 66],
        [
          2,
          [
            [1, "sec-old"],
            [3, "Old Equity"],
            [4, "GBP"],
            [
              13,
              [
                [1, 20_162],
                [2, 10_000_000_000],
              ],
            ],
          ],
        ],
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
                [1, "aa-eq"],
                [2, "aa-root"],
                [3, "Global equity"],
                [6, 10_000],
              ],
            ],
          ],
        ],
        [12, "GBP"],
      ]);

      await storePortfolio(0, {
        content: oldDated,
        fileName: "historic.portfolio",
      });
      const storedOld = await readLatestPortfolio(db);
      expect(dayOf(storedOld?.savedAt ?? today)).not.toBe("2025-03-15");
      expect(
        soundKept(upcast((await readLatest(db, ""))?.household)).kept.targets
          ?.importedOn,
      ).toBe("2025-03-15");

      // A quote-free, transaction-free file falls back to savedOn.
      const undated = portfolioFile([
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
                [1, "aa-eq"],
                [2, "aa-root"],
                [3, "Global equity"],
                [6, 10_000],
              ],
            ],
          ],
        ],
        [12, "GBP"],
      ]);

      await storePortfolio(1, {
        content: undated,
        fileName: "undated.portfolio",
      });
      const storedUndated = await readLatestPortfolio(db);
      expect(
        soundKept(upcast((await readLatest(db, ""))?.household)).kept.targets
          ?.importedOn,
      ).toBe(dayOf(storedUndated?.savedAt ?? today));
    });

    it("persists to portfolio_files and returns syncWarning when readPortfolioTargets refuses on upload or amendment", async () => {
      const withoutTaxonomy = portfolioFile(clientOf([]));

      const uploaded = await storePortfolio(0, {
        content: withoutTaxonomy,
        fileName: "plain.portfolio",
      });
      const storedUpload = await readLatestPortfolio(db);
      const uploadSavedOn = dayOf(storedUpload?.savedAt ?? today);
      expect(uploaded).toStrictEqual(
        saved({
          fileName: "plain.portfolio",
          savedOn: uploadSavedOn,
          syncWarning: "The file has no Asset Allocation taxonomy, only none",
          version: 1,
        }),
      );
      expect(await readLatest(db, "")).toBeNull();
      expect(refresh).toHaveBeenCalledTimes(1);

      const amended = await amendPortfolio(1, (stored) => {
        const { content, id } = appendAccount(
          stored.content,
          { currency: "GBP", kind: "cash", name: "Spare Cash" },
          { uuid: () => "cash-spare" },
        );
        return { content, result: { id } };
      });
      const storedAmend = await readLatestPortfolio(db);
      expect(amended).toStrictEqual(
        saved({
          id: "cash-spare",
          savedOn: dayOf(storedAmend?.savedAt ?? today),
          syncWarning: "The file has no Asset Allocation taxonomy, only none",
          version: 2,
        }),
      );
      expect(await readLatest(db, "")).toBeNull();
      expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("persists to portfolio_files and returns syncWarning when holdWhileLive refuses a live CMA household", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 0 },
        { ...reference, rateSet: "cma" },
      );

      const answer = await storePortfolio(0, {
        content: samplePortfolioFile(),
        fileName: "northstar.portfolio",
      });

      const stored = await readLatestPortfolio(db);
      expect(stored?.version).toBe(1);
      expect(answer).toStrictEqual(
        saved({
          fileName: "northstar.portfolio",
          savedOn: dayOf(stored?.savedAt ?? today),
          syncWarning:
            "Global equity has no CMA class, so this allocation cannot be synced while the plan runs on the CMA's rates. Choose custom rates, sync it and give its new categories a class, then choose From CMA again",
          version: 1,
        }),
      );
      expect((await readLatest(db, ""))?.version).toBe(1);
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("returns syncWarning cleanly when existing household fails soundKept or targets do not add up to 100%", async () => {
      await keepAfter(
        db,
        { scenario: "", version: 0 },
        {
          ...reference,
          accounts: [...reference.accounts, ...reference.accounts],
        },
      );

      const onCorrupt = await storePortfolio(0, {
        content: samplePortfolioFile(),
        fileName: "northstar.portfolio",
      });
      const storedFirst = await readLatestPortfolio(db);
      expect(onCorrupt).toMatchObject({
        kind: "saved",
        value: {
          fileName: "northstar.portfolio",
          savedOn: dayOf(storedFirst?.savedAt ?? today),
          syncWarning: expect.stringContaining(
            "A record's id is held by no other record",
          ) as unknown,
          version: 1,
        },
      });
      expect((await readLatest(db, ""))?.version).toBe(1);

      // Reset to a live CMA household and upload a file whose category shares sum to 50%:
      // share validation must refuse cleanly BEFORE holdWhileLive checks unmapped CMA classes.
      await memory.empty();
      await keepAfter(
        db,
        { scenario: "", version: 0 },
        { ...reference, rateSet: "cma" },
      );
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

      const onHalf = await storePortfolio(0, {
        content: halfWeighted,
        fileName: "half.portfolio",
      });
      const storedHalf = await readLatestPortfolio(db);
      expect(onHalf).toStrictEqual(
        saved({
          fileName: "half.portfolio",
          savedOn: dayOf(storedHalf?.savedAt ?? today),
          syncWarning: "Target category shares must add up to 100%",
          version: 1,
        }),
      );
      expect((await readLatest(db, ""))?.version).toBe(1);
    });

    it("skips syncing when a newer portfolio version lands first or no portfolio row remains", async () => {
      await keepAfter(db, { scenario: "", version: 0 }, reference);
      const firstBytes = samplePortfolioFile("GBP");
      const secondBytes = samplePortfolioFile("EUR");

      let raced: Promise<unknown> = Promise.resolve();
      const select = db.select.bind(db);
      const insert = db.insert.bind(db);
      const selectSpy = vi
        .spyOn(db, "select")
        .mockImplementationOnce((fields) => select(fields))
        .mockImplementationOnce((fields) => select(fields))
        .mockImplementationOnce((fields) => {
          raced = insert(portfolioFiles)
            .values({
              content: secondBytes,
              fileName: "newer.portfolio",
              savedAt: new Date("2026-09-15T13:00:00Z"),
              version: 2,
            })
            .execute();
          return select(fields);
        });

      const answer = await storePortfolio(0, {
        content: firstBytes,
        fileName: "older.portfolio",
      });
      await raced;
      selectSpy.mockRestore();

      const latestAfterRace = await readLatestPortfolio(db);
      expect(latestAfterRace?.version).toBe(2);
      expect(answer).toStrictEqual(
        saved({
          fileName: "older.portfolio",
          savedOn: dayOf(today),
          version: 1,
        }),
      );
      // Household stayed at version 1 because version 2 owns syncing.
      expect((await readLatest(db, ""))?.version).toBe(1);

      // Also cover latestPortfolio === null after portfolio commit.
      await memory.empty();
      await keepAfter(db, { scenario: "", version: 0 }, reference);
      let emptied: Promise<unknown> = Promise.resolve();
      const nullSpy = vi
        .spyOn(db, "select")
        .mockImplementationOnce((fields) => select(fields))
        .mockImplementationOnce((fields) => select(fields))
        .mockImplementationOnce((fields) => {
          emptied = memory.empty();
          return select(fields);
        });

      const onMissing = await storePortfolio(0, {
        content: firstBytes,
        fileName: "vanished.portfolio",
      });
      await emptied;
      nullSpy.mockRestore();

      expect(onMissing).toMatchObject({
        kind: "saved",
        value: { fileName: "vanished.portfolio", version: 1 },
      });
      expect(await readLatest(db, "")).toBeNull();
    });

    it("prevents a stale sync from overwriting household_versions when portfolio_files advances after readLatestPortfolio and before keepAfter", async () => {
      await keepAfter(db, { scenario: "", version: 0 }, reference);
      const firstBytes = samplePortfolioFile("GBP");
      const secondBytes = samplePortfolioFile("EUR");

      const insert = db.insert.bind(db);
      let raced: Promise<unknown> = Promise.resolve();
      const insertSpy = vi
        .spyOn(db, "insert")
        .mockImplementationOnce((table) => insert(table))
        .mockImplementationOnce((table) => {
          raced = insert(portfolioFiles)
            .values({
              content: secondBytes,
              fileName: "newer.portfolio",
              savedAt: new Date("2026-09-15T13:00:00Z"),
              version: 2,
            })
            .execute();
          return insert(table);
        });

      const answer = await storePortfolio(0, {
        content: firstBytes,
        fileName: "older.portfolio",
      });
      await raced;
      insertSpy.mockRestore();

      expect((await readLatestPortfolio(db))?.version).toBe(2);
      expect(answer).toStrictEqual(
        saved({
          fileName: "older.portfolio",
          savedOn: dayOf(today),
          version: 1,
        }),
      );
      expect((await readLatest(db, ""))?.version).toBe(1);
    });

    it("retries once on a keepAfter optimistic conflict and succeeds against the newer household version", async () => {
      await keepAfter(db, { scenario: "", version: 0 }, reference);
      const bytes = samplePortfolioFile();
      const insert = db.insert.bind(db);
      let raced: Promise<unknown> = Promise.resolve();
      const insertSpy = vi
        .spyOn(db, "insert")
        .mockImplementationOnce((table) => insert(table))
        .mockImplementationOnce((table) => {
          raced = insert(householdVersions)
            .values({
              household: stamped({ ...reference, ages: { ends: 95 } }),
              scenario: "",
              version: 2,
            })
            .execute();
          return insert(table);
        });

      const answer = await storePortfolio(0, {
        content: bytes,
        fileName: "northstar.portfolio",
      });
      await raced;
      insertSpy.mockRestore();

      const stored = await readLatestPortfolio(db);
      const savedOn = dayOf(stored?.savedAt ?? today);
      expect(answer).toStrictEqual(
        saved({ fileName: "northstar.portfolio", savedOn, version: 1 }),
      );

      const householdRow = await readLatest(db, "");
      expect(householdRow?.version).toBe(3);
      const { kept } = soundKept(upcast(householdRow?.household));
      expect(kept.ages).toStrictEqual({ ends: 95 });
      const { categories, portfolios } = readPortfolioTargets(bytes);
      expect(kept.targets).toStrictEqual({
        categories,
        importedOn: "2026-09-22",
        portfolios,
      });
    });

    it("returns syncWarning when keepAfter conflicts on both the initial attempt and its single retry", async () => {
      await keepAfter(db, { scenario: "", version: 0 }, reference);
      const bytes = samplePortfolioFile();
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

      const answer = await storePortfolio(0, {
        content: bytes,
        fileName: "northstar.portfolio",
      });
      await Promise.all([racedFirst, racedSecond]);
      insertSpy.mockRestore();

      const stored = await readLatestPortfolio(db);
      expect(answer).toStrictEqual(
        saved({
          fileName: "northstar.portfolio",
          savedOn: dayOf(stored?.savedAt ?? today),
          syncWarning:
            "The household changed while this was being saved, so nothing was",
          version: 1,
        }),
      );
      expect((await readLatest(db, ""))?.version).toBe(3);
      expect(refresh).toHaveBeenCalledOnce();
    });

    it("logs unexpected secondary database failures via console.error and still returns the saved portfolio with syncWarning", async () => {
      await keepAfter(db, { scenario: "", version: 0 }, reference);
      const insert = db.insert.bind(db);
      const insertSpy = vi
        .spyOn(db, "insert")
        .mockImplementationOnce((table) => insert(table))
        .mockImplementationOnce(() => {
          throw new Error("household store unavailable");
        });

      const answer = await storePortfolio(0, {
        content: samplePortfolioFile(),
        fileName: "northstar.portfolio",
      });
      insertSpy.mockRestore();

      const stored = await readLatestPortfolio(db);
      expect(stored?.version).toBe(1);
      expect(answer).toStrictEqual(
        saved({
          fileName: "northstar.portfolio",
          savedOn: dayOf(stored?.savedAt ?? today),
          syncWarning:
            "The household target allocation could not be synced yet",
          version: 1,
        }),
      );
      expect(refresh).toHaveBeenCalledOnce();
      expect(takeConsoleOutput()).toStrictEqual([
        expect.stringMatching(
          /^console\.error: The portfolio file was saved, but the household target allocation could not be synced Error: household store unavailable/u,
        ),
      ]);
    });
  });
});
