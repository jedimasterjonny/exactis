// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { kept, today } from "@/data/household.fixture";
import { curve } from "@/data/inflation.fixture";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";
import { readCurve } from "@/lib/yield-curves";
import { bankFile, booksOf, quoted } from "@/lib/yield-curves.fixture";

import { pullCurve } from "./inflation";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// The Bank's file for the days quoted, the latest the first of
// September 2026.
const file = bankFile(booksOf(quoted));

// The Bank answering the fetch with the response given.
function bankSends(response: Response): ReturnType<typeof vi.fn> {
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("pullCurve", () => {
  standUp(memory, { today });

  it("sends for nothing and writes nothing without a session", async () => {
    const fetch = bankSends(new Response(file));
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(pullCurve()).rejects.toThrow("redirected");
    expect(fetch).not.toHaveBeenCalled();
    expect(await readLatest(db)).toBeNull();
  });

  it("keeps the latest day's curve from the Bank's file, draws the page again and hands the curve back", async () => {
    const fetch = bankSends(new Response(file));

    expect(await pullCurve()).toStrictEqual(saved(readCurve(file)));
    expect(fetch).toHaveBeenCalledWith(
      "https://www.bankofengland.co.uk/-/media/boe/files/statistics/yield-curves/latest-yield-curve-data.zip",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(await readLatest(db)).toMatchObject({
      household: { curve: { asOf: "2026-09-01" } },
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the curve pulled over the one the household held, and nothing else", async () => {
    const held = { ...kept, curve: { ...curve, asOf: "2026-08-03" } };
    bankSends(new Response(file));
    await keepAfter(db, 0, held);

    await pullCurve();

    expect(await readLatest(db)).toStrictEqual({
      household: { ...held, curve: readCurve(file) },
      version: 2,
    });
  });

  // The fixture household keeps the first of September's curve, the
  // day the file runs to, so the pull is of the same day again.
  it("keeps a curve of the same day as the one held, and refuses an older one", async () => {
    await keepAfter(db, 0, {
      ...kept,
      curve: { ...curve, asOf: "2026-09-24" },
    });
    bankSends(new Response(file));

    expect(await pullCurve()).toStrictEqual(
      refused(
        "The Bank's file runs to 2026-09-01, before the curve already kept for 2026-09-24",
      ),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });

    await keepAfter(db, 1, kept);
    bankSends(new Response(file));

    expect(await pullCurve()).toStrictEqual(saved(readCurve(file)));
    expect(await readLatest(db)).toMatchObject({ version: 3 });
  });

  it("refuses when the Bank does not answer, and keeps nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    expect(await pullCurve()).toStrictEqual(
      refused("The Bank of England did not send its yield curves"),
    );
    expect(await readLatest(db)).toBeNull();
  });

  it("refuses a file no curve can be read from, in the reader's words, and keeps nothing", async () => {
    bankSends(new Response(bankFile({})));

    expect(await pullCurve()).toStrictEqual(
      refused("The Bank's file holds no GLC Inflation workbook"),
    );
    expect(await readLatest(db)).toBeNull();
  });
});
