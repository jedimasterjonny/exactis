// @vitest-environment node
import { cacheLife, cacheTag } from "next/cache";
import { describe, expect, it, vi } from "vitest";

import { accounts } from "@/data/accounts.fixture";
import { listAccounts } from "@/db/accounts";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/session";

import { accountsTag, getAccounts } from "./accounts";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn() }));
vi.mock("@/db/accounts", () => ({ listAccounts: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

describe("getAccounts", () => {
  it("reads nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(getAccounts()).rejects.toThrow("redirected");
    expect(listAccounts).not.toHaveBeenCalled();
  });

  it("reads the store's accounts behind the session, tagged and given a life", async () => {
    const db = getDb();
    vi.mocked(listAccounts).mockResolvedValue([...accounts]);

    expect(await getAccounts()).toStrictEqual(accounts);
    expect(requireSession).toHaveBeenCalledOnce();
    expect(listAccounts).toHaveBeenCalledExactlyOnceWith(db);
    expect(cacheTag).toHaveBeenCalledExactlyOnceWith(accountsTag);
    expect(cacheLife).toHaveBeenCalledExactlyOnceWith("hours");
  });
});
