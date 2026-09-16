import { cacheLife } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { project } from "@/engine/projection";

import { getAccounts } from "./accounts/store";
import { getPlan, getProjection } from "./store";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("@/engine/projection", () => ({ project: vi.fn() }));
vi.mock("./accounts/store", () => ({ getAccounts: vi.fn() }));

describe("getPlan", () => {
  it("hands out the plan's constants from this year", () => {
    vi.useFakeTimers({ now: new Date("2026-09-15T12:00:00Z") });

    expect(getPlan()).toStrictEqual({
      born: 1992,
      from: 2026,
      rate: 0.05,
      years: 30,
    });
  });
});

describe("getProjection", () => {
  it("projects nothing without the accounts", async () => {
    vi.mocked(getAccounts).mockRejectedValue(new Error("redirected"));

    await expect(getProjection()).rejects.toThrow("redirected");
    expect(project).not.toHaveBeenCalled();
  });

  it("runs the engine over the store's accounts from this year, given a life", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-15T12:00:00Z") });
    const points = [{ age: 34, deferred: 391640, free: 271930, year: 2026 }];
    vi.mocked(getAccounts).mockResolvedValue([...accounts]);
    vi.mocked(project).mockReturnValue(points);

    expect(await getProjection()).toBe(points);
    expect(project).toHaveBeenCalledExactlyOnceWith(accounts, {
      born: 1992,
      from: 2026,
      rate: 0.05,
      years: 30,
    });
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });
});
