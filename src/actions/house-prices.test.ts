// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { readIndex, revalued, worthIn } from "@/data/house-prices";
import { quoted, registryAnswer } from "@/data/house-prices.fixture";
import { kept, today } from "@/data/household.fixture";
import { homeValues, house, houseLoan } from "@/data/houses.fixture";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { pullHousePrices } from "./house-prices";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// The Registry's answer for the months quoted, the latest July 2026.
const file = registryAnswer(quoted);

// The address the index is asked for at, from the month the kit's house
// was bought in.
const address =
  "https://landregistry.data.gov.uk/data/ukhpi/region/dorset.json?min-refMonth=2022-06&_pageSize=200&_sort=-refMonth&_properties=refMonth,averagePriceDetached";

// The reference household with its home as the house it is, bought in
// June 2022 for £380,000, and its mortgage secured on it, since the
// fixture's home is a real asset and the pull wants a house; and with
// an index pulled before, running to a month earlier.
const withHouse = {
  ...kept,
  accounts: [...kept.accounts.slice(0, 3), house, houseLoan],
  housePrices: {
    from: { month: 5, year: 2022 },
    pulledOn: "2026-08-03",
    to: { month: 5, year: 2026 },
  },
};

// The Registry answering the fetch with the response given.
function registrySends(response: Response): ReturnType<typeof vi.fn> {
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("pullHousePrices", () => {
  standUp(memory, { today });

  it("sends for nothing and writes nothing without a session", async () => {
    const fetch = registrySends(new Response(file));
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(pullHousePrices()).rejects.toThrow("redirected");
    expect(fetch).not.toHaveBeenCalled();
    expect(await readLatest(db)).toBeNull();
  });

  // The balances are as of September 2026, past July's latest figure,
  // so the house's £416,386 typed is set to July's £368,003 rolled
  // forward, and dated the day the pull was made.
  it("keeps the index pulled, writes the house into the points from its purchase, sets the house's balance off it, draws the page again and hands the pull back", async () => {
    const fetch = registrySends(new Response(file));
    await keepAfter(db, 0, withHouse);
    const index = readIndex(file, homeValues.bought.month);

    const housePrices = {
      from: { month: 5, year: 2022 },
      pulledOn: "2026-09-15",
      to: { month: 6, year: 2026 },
    };

    expect(await pullHousePrices()).toStrictEqual(
      saved({ ...housePrices, name: "Home", worth: 368003 }),
    );
    expect(fetch).toHaveBeenCalledWith(
      address,
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(await readLatest(db)).toStrictEqual({
      household: {
        ...withHouse,
        accounts: [
          ...kept.accounts.slice(0, 3),
          { ...house, balance: 368003, setOn: "2026-09-15" },
          houseLoan,
        ],
        housePrices,
        points: revalued(kept.points, homeValues.bought, index),
      },
      version: 2,
    });
    expect(worthIn(kept.asOf, homeValues.bought, index)).toBe(368003);
    expect(refresh).toHaveBeenCalledOnce();
  });

  // A save landing while the index is on its way, here the price
  // corrected, leaves a purchase the index was not asked for.
  it("refuses to keep the pull over a house saved while the index was on its way, and keeps the save", async () => {
    await keepAfter(db, 0, withHouse);
    const corrected = {
      ...withHouse,
      accounts: [
        ...kept.accounts.slice(0, 3),
        { ...house, bought: { ...homeValues.bought, price: 400000 } },
        houseLoan,
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        await keepAfter(db, 1, corrected);
        return new Response(file);
      }),
    );

    expect(await pullHousePrices()).toStrictEqual(
      refused(
        "The house changed while its prices were pulled, so nothing was kept; pull them again",
      ),
    );
    expect(await readLatest(db)).toStrictEqual({
      household: corrected,
      version: 2,
    });
  });

  it("refuses an index running to a month before the one already pulled, and keeps nothing", async () => {
    registrySends(new Response(file));
    await keepAfter(db, 0, {
      ...withHouse,
      housePrices: { ...withHouse.housePrices, to: { month: 7, year: 2026 } },
    });

    expect(await pullHousePrices()).toStrictEqual(
      refused(
        "The Land Registry's index runs to July 2026, before the August 2026 already pulled",
      ),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });

  // The fixture's home is a real asset, so the reference household
  // lists no house, and the household before anything is saved lists
  // nothing at all.
  it("refuses before asking the Registry while the household lists no house, and keeps nothing", async () => {
    const fetch = registrySends(new Response(file));

    expect(await pullHousePrices()).toStrictEqual(
      refused("No house is listed, so there is nothing to revalue"),
    );

    await keepAfter(db, 0, kept);

    expect(await pullHousePrices()).toStrictEqual(
      refused("No house is listed, so there is nothing to revalue"),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });

  it("refuses before asking the Registry while the household lists two houses, and keeps nothing", async () => {
    const fetch = registrySends(new Response(file));
    await keepAfter(db, 0, {
      ...withHouse,
      accounts: [...withHouse.accounts, { ...house, id: 6, name: "Flat" }],
      next: 7,
    });

    expect(await pullHousePrices()).toStrictEqual(
      refused("The points carry one house, and the household lists 2 houses"),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });

  it("refuses when the Registry does not answer, and keeps nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );
    await keepAfter(db, 0, withHouse);

    expect(await pullHousePrices()).toStrictEqual(
      refused("The Land Registry did not send its house price index"),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });

  it("refuses an answer no index can be read from, in the reader's words, and keeps nothing", async () => {
    registrySends(new Response("<html>Service unavailable</html>"));
    await keepAfter(db, 0, withHouse);

    expect(await pullHousePrices()).toStrictEqual(
      refused("The Land Registry's answer is not its house price index"),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });
});
