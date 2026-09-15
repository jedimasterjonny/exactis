import { drizzle } from "drizzle-orm/neon-http";
import { updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { accounts } from "@/data/accounts.fixture";
import { insertAccount, updateAccount } from "@/db/accounts";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/session";

import { saveAccount } from "./actions";
import { accountsTag } from "./store";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("@/db/accounts", () => ({
  insertAccount: vi.fn(),
  updateAccount: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const [pension, , , home] = accounts;

const values = {
  balance: 4000,
  cadence: "month",
  contribution: 333,
  growth: "fixed",
  kind: "tax-free",
  name: " Lifetime ISA ",
  rate: 0.03,
} as const;

// A database that answers nothing, standing in for the one the client
// would open; the queries are mocked, so it is only ever handed on.
const db = drizzle.mock();

describe("saveAccount", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
  });

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveAccount(null, values)).rejects.toThrow("redirected");
    expect(insertAccount).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("inserts a new account with the name trimmed and expires the tag", async () => {
    vi.mocked(insertAccount).mockResolvedValue(pension);

    expect(await saveAccount(null, values)).toBe(pension);
    expect(insertAccount).toHaveBeenCalledExactlyOnceWith(db, {
      ...values,
      name: "Lifetime ISA",
    });
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(accountsTag);
  });

  it("writes over the account with the id and expires the tag", async () => {
    vi.mocked(updateAccount).mockResolvedValue(home);

    expect(await saveAccount(4, values)).toBe(home);
    expect(updateAccount).toHaveBeenCalledExactlyOnceWith(db, 4, {
      ...values,
      name: "Lifetime ISA",
    });
    expect(insertAccount).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(accountsTag);
  });

  it("refuses what the form could not have sent", async () => {
    await expect(saveAccount(0, values)).rejects.toThrow(z.ZodError);
    await expect(saveAccount(null, { ...values, name: "  " })).rejects.toThrow(
      z.ZodError,
    );
    await expect(
      saveAccount(null, { ...values, contribution: -1 }),
    ).rejects.toThrow(z.ZodError);
    await expect(
      saveAccount(null, { ...values, balance: 0.5 }),
    ).rejects.toThrow(z.ZodError);
    expect(insertAccount).not.toHaveBeenCalled();
    expect(updateAccount).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});
