// @vitest-environment node
import { cacheLife, cacheTag } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { getDb } from "@/db/client";
import { listOwners } from "@/db/owners";
import { requireSession } from "@/lib/session";

import { getOwners, ownersTag } from "./owners";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/owners", () => ({ listOwners: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

describe("getOwners", () => {
  it("reads nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(getOwners()).rejects.toThrow("redirected");
    expect(listOwners).not.toHaveBeenCalled();
  });

  it("reads the store's owners behind the session, tagged and given a life", async () => {
    const db = getDb();
    const owners = [{ id: 1, name: "Me" }];
    vi.mocked(listOwners).mockResolvedValue(owners);

    expect(await getOwners()).toStrictEqual(owners);
    expect(requireSession).toHaveBeenCalledOnce();
    expect(listOwners).toHaveBeenCalledExactlyOnceWith(db);
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith(ownersTag);
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });
});
