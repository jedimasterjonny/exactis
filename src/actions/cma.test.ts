// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { cma } from "@/data/cma.fixture";
import { kept, today } from "@/data/household.fixture";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { cmaFile, priced, startingPointOf } from "@/lib/cma-workbook.fixture";
import { requireSession } from "@/lib/session";
import { workbookOf } from "@/lib/workbook.fixture";

import { pullCma } from "./cma";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// BlackRock's workbook of the August 2026 vintage, on a buffer of its
// own as a response's body is.
const file = new Uint8Array(cmaFile());

// The vintages of May and November 2026, priced as August's is.
const may = { ...cma, asOf: "2026-03-31", vintage: { month: 4, year: 2026 } };
const november = {
  ...cma,
  asOf: "2026-09-30",
  vintage: { month: 10, year: 2026 },
};

// BlackRock answering the fetch with the response given.
function blackRockSends(response: Response): ReturnType<typeof vi.fn> {
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("pullCma", () => {
  standUp(memory, { today });

  it("sends for nothing and writes nothing without a session", async () => {
    const fetch = blackRockSends(new Response(file));
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(pullCma()).rejects.toThrow("redirected");
    expect(fetch).not.toHaveBeenCalled();
    expect(await readLatest(db)).toBeNull();
  });

  it("keeps BlackRock's latest vintage with none before it, draws the page again and hands the vintage back", async () => {
    const fetch = blackRockSends(new Response(file));

    expect(await pullCma()).toStrictEqual(saved(cma));
    expect(fetch).toHaveBeenCalledWith(
      "https://www.blackrock.com/blk-inst-c-assets/images/tools/blackrock-investment-institute/cma/blackrock-capital-market-assumptions.xlsx",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(await readLatest(db)).toMatchObject({
      household: { cma: { latest: cma, previous: null } },
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("moves the vintage held to the previous when a later one is pulled, and keeps the rest of the household as it was", async () => {
    const held = { ...kept, cma: { latest: may, previous: null } };
    await keepAfter(db, 0, held);
    blackRockSends(new Response(file));

    await pullCma();

    expect(await readLatest(db)).toStrictEqual({
      household: { ...held, cma: { latest: cma, previous: may } },
      version: 2,
    });
  });

  // A reissue of the vintage held replaces it, and is compared with the
  // vintage before it rather than with itself.
  it("replaces the vintage held with the same one again, keeping the previous as it was", async () => {
    const reissued = { ...cma, asOf: "2026-06-29" };
    await keepAfter(db, 0, {
      ...kept,
      cma: { latest: reissued, previous: may },
    });
    blackRockSends(new Response(file));

    expect(await pullCma()).toStrictEqual(saved(cma));
    expect(await readLatest(db)).toMatchObject({
      household: { cma: { latest: cma, previous: may } },
      version: 2,
    });
  });

  // With no US cash, August gives no sterling-hedged global bonds, which
  // the reference maps its hedged global bonds onto.
  it("refuses a vintage the CMA's rates cannot be derived from while they are live, saying how to keep it, and keeps nothing", async () => {
    const uncarried = new Uint8Array(
      cmaFile(
        startingPointOf(priced.filter(([, , name]) => name !== "US cash")),
      ),
    );
    await keepAfter(db, 0, {
      ...kept,
      cma: { latest: may, previous: null },
      rateSet: "cma",
    });
    blackRockSends(new Response(uncarried));

    expect(await pullCma()).toStrictEqual(
      refused(
        "Global bonds, hedged is mapped onto a class the August 2026 CMA does not price, so this vintage cannot be kept while the plan runs on the CMA's rates. Choose custom rates, pull it and map onto its classes, then choose From CMA again",
      ),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });

    blackRockSends(new Response(file));

    expect(await pullCma()).toStrictEqual(saved(cma));
    expect(await readLatest(db)).toMatchObject({
      household: { rateSet: "cma" },
      version: 2,
    });
  });

  it("refuses a vintage earlier than the one held, and keeps nothing", async () => {
    await keepAfter(db, 0, {
      ...kept,
      cma: { latest: november, previous: cma },
    });
    blackRockSends(new Response(file));

    expect(await pullCma()).toStrictEqual(
      refused(
        "BlackRock's workbook is its August 2026 vintage, before the November 2026 one already kept",
      ),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });

  it("refuses when BlackRock does not answer, and keeps nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    expect(await pullCma()).toStrictEqual(
      refused("BlackRock did not send its capital market assumptions"),
    );
    expect(await readLatest(db)).toBeNull();
  });

  it("refuses a workbook no vintage can be read from, in the reader's words, and keeps nothing", async () => {
    blackRockSends(
      new Response(
        new Uint8Array(workbookOf({ "Strategic asset allocation": [] })),
      ),
    );

    expect(await pullCma()).toStrictEqual(
      refused("The workbook has no sheet Starting point"),
    );
    expect(await readLatest(db)).toBeNull();
  });
});
