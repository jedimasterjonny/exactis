import { cacheLife } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { project } from "@/engine/projection";

import { getAccounts } from "./accounts/store";
import { getProjection } from "./store";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn() }));
vi.mock("@/engine/projection", () => ({ project: vi.fn() }));
vi.mock("./accounts/store", () => ({ getAccounts: vi.fn() }));

describe("getProjection", () => {
  it("projects nothing without the accounts", async () => {
    vi.mocked(getAccounts).mockRejectedValue(new Error("redirected"));

    await expect(getProjection()).rejects.toThrow("redirected");
    expect(project).not.toHaveBeenCalled();
  });

  it("runs the engine over the store's accounts from this year, given a life", async () => {
    vi.useFakeTimers({ now: new Date("2026-09-15T12:00:00Z") });
    const points = [{ age: 36, free: 286145, year: 2026 }];
    vi.mocked(getAccounts).mockResolvedValue([...accounts]);
    vi.mocked(project).mockReturnValue(points);

    expect(await getProjection()).toBe(points);
    expect(project).toHaveBeenCalledExactlyOnceWith(accounts, {
      born: 1990,
      from: 2026,
      rate: 0.05,
      years: 30,
    });
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });
});
