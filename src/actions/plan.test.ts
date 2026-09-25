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

// The fixture's plan is read in 2026 for someone born in 1990, who is
// 36, and the store holds a plan to 89 retiring at 59.
describe("saveAges", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(getPlan).mockResolvedValue(plan);
    vi.mocked(findAges).mockResolvedValue({ ends: 89, retires: 59 });
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
      ends: 89,
      retires: 55,
    });
    expect(writeAges).toHaveBeenCalledExactlyOnceWith(db, {
      ends: 89,
      retires: 55,
    });
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(planTag);
  });

  it("writes the end age over the store's, keeping its retirement age", async () => {
    expect(await saveAges({ ends: 95 })).toStrictEqual({
      ends: 95,
      retires: 59,
    });
  });

  it("refuses an age that is not a whole number, or is below nothing", async () => {
    await expect(saveAges({ retires: 59.5 })).rejects.toThrow(z.ZodError);
    await expect(saveAges({ retires: -1 })).rejects.toThrow(z.ZodError);
    expect(writeAges).not.toHaveBeenCalled();
  });

  // 36 is the age already reached, so a plan to it has no year left.
  it("holds the end age past the age already reached and to 120", async () => {
    await expect(saveAges({ ends: 36, retires: 30 })).rejects.toThrow(
      "A plan ends after the age already reached and by 120",
    );
    await expect(saveAges({ ends: 121 })).rejects.toThrow(
      "A plan ends after the age already reached and by 120",
    );
    expect(await saveAges({ ends: 37, retires: 37 })).toStrictEqual({
      ends: 37,
      retires: 37,
    });
    expect(await saveAges({ ends: 120 })).toStrictEqual({
      ends: 120,
      retires: 59,
    });
    expect(writeAges).toHaveBeenCalledTimes(2);
  });

  // The store holds a plan to 35, which the fixture's owner of 36 has
  // already outlived, as a plan saved years ago would be. It is kept as
  // it is rather than held to today again, so a retirement age saved
  // beside it stands, while one past it is still refused.
  it("keeps an end age already outlived rather than refusing a retirement age saved beside it", async () => {
    vi.mocked(findAges).mockResolvedValue({ ends: 35, retires: 34 });

    expect(await saveAges({ retires: 30 })).toStrictEqual({
      ends: 35,
      retires: 30,
    });
    expect(getPlan).not.toHaveBeenCalled();
    await expect(saveAges({ retires: 36 })).rejects.toThrow(
      "A plan's owner retires no later than it ends",
    );
  });

  // A retirement already past says only that nothing is earned by
  // working, so 30 is sound for someone of 36.
  it("holds the retirement age to the plan's end, but not to the age reached", async () => {
    await expect(saveAges({ retires: 90 })).rejects.toThrow(
      "A plan's owner retires no later than it ends",
    );
    await expect(saveAges({ ends: 58 })).rejects.toThrow(
      "A plan's owner retires no later than it ends",
    );
    expect(await saveAges({ retires: 30 })).toStrictEqual({
      ends: 89,
      retires: 30,
    });
    expect(writeAges).toHaveBeenCalledOnce();
  });
});
