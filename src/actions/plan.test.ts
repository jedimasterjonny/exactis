// @vitest-environment node
import { drizzle } from "drizzle-orm/neon-http";
import { updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { plan } from "@/data/income.fixture";
import { getDb } from "@/db/client";
import { findAges, writeAges } from "@/db/plan";
import { requireSession } from "@/lib/session";
import { getPlan, planTag } from "@/store/plan";

import { saveAges } from "./plan";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/db/plan", () => ({ findAges: vi.fn(), writeAges: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));
vi.mock("@/store/plan", () => ({ getPlan: vi.fn(), planTag: "plan" }));

// A database that answers nothing, standing in for the one the client
// would open; the queries are mocked, so it is only ever handed on.
const db = drizzle.mock();

// The fixture's plan is read in 2026 for someone born in 1992, who is
// 34, and the store holds a plan to 91 retiring at 61.
describe("saveAges", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(getPlan).mockResolvedValue(plan);
    vi.mocked(findAges).mockResolvedValue({ ends: 91, retires: 61 });
    vi.mocked(writeAges).mockImplementation(
      async (_db, ages) => await Promise.resolve(ages),
    );
  });

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveAges({ retires: 60 })).rejects.toThrow("redirected");
    expect(writeAges).not.toHaveBeenCalled();
  });

  it("writes the retirement age over the store's, keeping its end age, and expires the plan", async () => {
    expect(await saveAges({ retires: 55 })).toStrictEqual({
      ends: 91,
      retires: 55,
    });
    expect(writeAges).toHaveBeenCalledExactlyOnceWith(db, {
      ends: 91,
      retires: 55,
    });
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(planTag);
  });

  it("writes the end age over the store's, keeping its retirement age", async () => {
    expect(await saveAges({ ends: 97 })).toStrictEqual({
      ends: 97,
      retires: 61,
    });
  });

  it("refuses an age that is not a whole number, or is below nothing", async () => {
    await expect(saveAges({ retires: 61.5 })).rejects.toThrow(z.ZodError);
    await expect(saveAges({ retires: -1 })).rejects.toThrow(z.ZodError);
    expect(writeAges).not.toHaveBeenCalled();
  });

  // 34 is the age already reached, so a plan to it has no year left.
  it("holds the end age past the age already reached and to 120", async () => {
    await expect(saveAges({ ends: 34, retires: 28 })).rejects.toThrow(
      "A plan ends after the age already reached and by 120",
    );
    await expect(saveAges({ ends: 121 })).rejects.toThrow(
      "A plan ends after the age already reached and by 120",
    );
    expect(await saveAges({ ends: 35, retires: 35 })).toStrictEqual({
      ends: 35,
      retires: 35,
    });
    expect(await saveAges({ ends: 120 })).toStrictEqual({
      ends: 120,
      retires: 61,
    });
    expect(writeAges).toHaveBeenCalledTimes(2);
  });

  // The store holds a plan to 33, which the fixture's owner of 34 has
  // already outlived, as a plan saved years ago would be. It is kept as
  // it is rather than held to today again, so a retirement age saved
  // beside it stands, while one past it is still refused.
  it("keeps an end age already outlived rather than refusing a retirement age saved beside it", async () => {
    vi.mocked(findAges).mockResolvedValue({ ends: 33, retires: 32 });

    expect(await saveAges({ retires: 28 })).toStrictEqual({
      ends: 33,
      retires: 28,
    });
    expect(getPlan).not.toHaveBeenCalled();
    await expect(saveAges({ retires: 34 })).rejects.toThrow(
      "A plan's owner retires no later than it ends",
    );
  });

  // A retirement already past says only that nothing is earned by
  // working, so 28 is sound for someone of 34.
  it("holds the retirement age to the plan's end, but not to the age reached", async () => {
    await expect(saveAges({ retires: 92 })).rejects.toThrow(
      "A plan's owner retires no later than it ends",
    );
    await expect(saveAges({ ends: 60 })).rejects.toThrow(
      "A plan's owner retires no later than it ends",
    );
    expect(await saveAges({ retires: 28 })).toStrictEqual({
      ends: 91,
      retires: 28,
    });
    expect(writeAges).toHaveBeenCalledOnce();
  });
});
