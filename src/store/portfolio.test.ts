// @vitest-environment node
import { strToU8 } from "fflate";
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { today } from "@/data/household.fixture";
import { maxPortfolioBytes, portfolioTooLarge } from "@/data/portfolio";
import { getDb } from "@/db/client";
import { inMemory } from "@/db/memory.fixture";
import { readLatestPortfolio } from "@/db/portfolio";
import { portfolioFiles } from "@/db/schema";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { dayOf } from "@/lib/months";
import { readPortfolioSnapshot } from "@/lib/portfolio-file";
import { samplePortfolioFile } from "@/lib/portfolio-file.fixture";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

import type { OwnedPortfolio } from "./portfolio";

import { getPortfolio, storePortfolio } from "./portfolio";

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
});
