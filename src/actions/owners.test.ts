// @vitest-environment node
import { drizzle } from "drizzle-orm/neon-http";
import { updateTag } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { isOwning } from "@/db/accounts";
import { getDb } from "@/db/client";
import { deleteOwner, insertOwner, updateOwner } from "@/db/owners";
import { requireSession } from "@/lib/session";
import { ownersTag } from "@/store/owners";

import { removeOwner, saveOwner } from "./owners";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("@/db/accounts", () => ({ isOwning: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/db/owners", () => ({
  deleteOwner: vi.fn(),
  insertOwner: vi.fn(),
  updateOwner: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

// A database that answers nothing, standing in for the one the client
// would open; the queries are mocked, so it is only ever handed on.
const db = drizzle.mock();

const me = { id: 1, name: "Me" };

describe("saveOwner", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
  });

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveOwner(null, { name: "Me" })).rejects.toThrow("redirected");
    expect(insertOwner).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("inserts a new owner with the name trimmed and expires the tag", async () => {
    vi.mocked(insertOwner).mockResolvedValue(me);

    expect(await saveOwner(null, { name: " Me " })).toBe(me);
    expect(insertOwner).toHaveBeenCalledExactlyOnceWith(db, { name: "Me" });
    expect(updateOwner).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(ownersTag);
  });

  it("writes over the owner with the id", async () => {
    vi.mocked(updateOwner).mockResolvedValue({ id: 1, name: "Alex" });

    expect(await saveOwner(1, { name: "Alex" })).toStrictEqual({
      id: 1,
      name: "Alex",
    });
    expect(updateOwner).toHaveBeenCalledExactlyOnceWith(db, 1, {
      name: "Alex",
    });
    expect(insertOwner).not.toHaveBeenCalled();
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(ownersTag);
  });

  it("refuses a name of nothing but space, and an id the list could not have sent", async () => {
    await expect(saveOwner(null, { name: "  " })).rejects.toThrow(z.ZodError);
    await expect(saveOwner(0, { name: "Me" })).rejects.toThrow(z.ZodError);
    expect(insertOwner).not.toHaveBeenCalled();
    expect(updateOwner).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});

describe("removeOwner", () => {
  beforeEach(() => {
    vi.mocked(getDb).mockReturnValue(db);
  });

  it("deletes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(removeOwner(me.id)).rejects.toThrow("redirected");
    expect(deleteOwner).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("deletes the owner with the id and expires the tag", async () => {
    vi.mocked(isOwning).mockResolvedValue(false);

    await removeOwner(me.id);

    expect(isOwning).toHaveBeenCalledExactlyOnceWith(db, me.id);
    expect(deleteOwner).toHaveBeenCalledExactlyOnceWith(db, me.id);
    expect(updateTag).toHaveBeenCalledExactlyOnceWith(ownersTag);
  });

  // An ISA or a pension belongs to an owner, so an owner an account
  // names stays until the account is given to another or deleted, and
  // the refusal says so rather than the store's broken link.
  it("refuses to delete an owner an account names", async () => {
    vi.mocked(isOwning).mockResolvedValue(true);

    await expect(removeOwner(me.id)).rejects.toThrow(
      "An owner who holds an account stays",
    );
    expect(deleteOwner).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("refuses an id the list could not have sent", async () => {
    await expect(removeOwner(0)).rejects.toThrow(z.ZodError);
    expect(deleteOwner).not.toHaveBeenCalled();
    expect(updateTag).not.toHaveBeenCalled();
  });
});
