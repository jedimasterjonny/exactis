// @vitest-environment node
import { drizzle } from "drizzle-orm/neon-http";
import { cacheLife, cacheTag } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { getDb } from "@/db/client";
import { findAges } from "@/db/plan";
import { requireSession } from "@/lib/session";

import { getPlan, planTag } from "./plan";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/db/plan", () => ({ findAges: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

// A database that answers nothing, standing in for the one the client
// would open; the query is mocked, so it is only ever handed on.
const db = drizzle.mock();

describe("getPlan", () => {
  it("reads nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(getPlan()).rejects.toThrow("redirected");
    expect(findAges).not.toHaveBeenCalled();
  });

  it("runs from this year and this month to the ages the store keeps, tagged and given a life", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-15T12:00:00Z") });
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(findAges).mockResolvedValue({ ends: 89, retires: 59 });

    expect(await getPlan()).toStrictEqual({
      born: 1990,
      from: 2026,
      month: 8,
      rate: 0.05,
      retires: 59,
      years: 53,
    });
    expect(findAges).toHaveBeenCalledExactlyOnceWith(db);
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith(planTag);
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });

  // Born in 1990, a plan to 30 has run its course by 2026, and runs no
  // years forward rather than a count below nothing.
  it("runs no years forward once its age is reached", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-15T12:00:00Z") });
    vi.mocked(findAges).mockResolvedValue({ ends: 30, retires: 59 });

    expect(await getPlan()).toMatchObject({ from: 2026, years: 0 });
  });
});
