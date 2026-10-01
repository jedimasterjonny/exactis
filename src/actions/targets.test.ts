// @vitest-environment node
import { refresh } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import * as z from "zod";

import { blank, kept as reference, today } from "@/data/household.fixture";
import { targets } from "@/data/targets.fixture";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { importTargets } from "./targets";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

// The reference categories, read on the day the store is stood up on.
const importedToday = { ...targets, importedOn: "2026-09-15" };

describe("importTargets", () => {
  standUp(memory, { today });

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(importTargets(targets.categories)).rejects.toThrow(
      "redirected",
    );
    expect(await readLatest(db)).toBeNull();
  });

  it("keeps the categories as imported today, draws the page again and hands them back", async () => {
    expect(await importTargets(targets.categories)).toStrictEqual(
      saved(importedToday),
    );
    expect(await readLatest(db)).toStrictEqual({
      household: { ...blank, targets: importedToday },
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps an import over the one the household held, and nothing else", async () => {
    await keepAfter(db, 0, reference);
    const [first, second, ...rest] = targets.categories;
    const moved = [
      ...(first === undefined ? [] : [{ ...first, share: 0.5 }]),
      ...(second === undefined ? [] : [{ ...second, share: 0.1 }]),
      ...rest,
    ];

    await importTargets(moved);

    expect(await readLatest(db)).toStrictEqual({
      household: {
        ...reference,
        targets: { categories: moved, importedOn: "2026-09-15" },
      },
      version: 2,
    });
  });

  it("refuses categories that do not add up to the whole, and keeps nothing", async () => {
    expect(await importTargets(targets.categories.slice(1))).toStrictEqual(
      refused("A target allocation's categories add up to 100%"),
    );
    expect(await readLatest(db)).toBeNull();
  });

  // Only a bug or a forgery sends a category the reader could not
  // have read, so it fails loudly rather than being refused.
  it("fails on a category the reader could not have sent, and keeps nothing", async () => {
    const unnamed = targets.categories.map((category) => ({
      ...category,
      id: "",
    }));

    await expect(importTargets(unnamed)).rejects.toThrow(z.ZodError);
    expect(await readLatest(db)).toBeNull();
  });
});
