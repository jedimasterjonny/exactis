// @vitest-environment node
import { refresh } from "next/cache";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import * as z from "zod";

import { nothingKeptIn } from "@/data/household";
import { getDb } from "@/db/client";
import { keepAfter, readLatest } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { refused, saved } from "@/lib/answer";
import { requireSession } from "@/lib/session";

import { saveAges } from "./plan";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const { close, db, empty, ready } = inMemory();

// The day the plan is read on, when its owner, born in 1990, is 36.
const today = new Date("2026-09-15T12:00:00Z");

// The household before anything is saved, read this month.
const blank = nothingKeptIn({ month: 8, year: 2026 });

describe("saveAges", () => {
  beforeAll(ready);
  beforeEach(async () => {
    await empty();
    vi.mocked(getDb).mockReturnValue(db);
    vi.useFakeTimers({ now: today, toFake: ["Date"] });
  });
  afterAll(close);

  it("writes nothing without a session", async () => {
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(saveAges({ retires: 60 })).rejects.toThrow("redirected");
    expect(await readLatest(db)).toBeNull();
  });

  it("writes the retirement age over the household's, keeping its end age, and draws the page again", async () => {
    expect(await saveAges({ retires: 55 })).toStrictEqual(
      saved({ ends: 89, retires: 55 }),
    );
    expect(await readLatest(db)).toStrictEqual({
      household: { ...blank, ages: { ends: 89, retires: 55 } },
      version: 1,
    });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("writes the end age over the household's, keeping its retirement age", async () => {
    expect(await saveAges({ ends: 95 })).toStrictEqual(
      saved({ ends: 95, retires: 59 }),
    );
  });

  it("refuses an age that is not a whole number, or is below nothing", async () => {
    await expect(saveAges({ retires: 59.5 })).rejects.toThrow(z.ZodError);
    await expect(saveAges({ retires: -1 })).rejects.toThrow(z.ZodError);
    expect(await readLatest(db)).toBeNull();
  });

  // 36 is the age already reached, so a plan to it has no year left.
  it("holds the end age past the age already reached and to 120", async () => {
    await expect(saveAges({ ends: 36, retires: 30 })).resolves.toStrictEqual(
      refused("A plan ends after the age already reached and by 120"),
    );
    await expect(saveAges({ ends: 121 })).resolves.toStrictEqual(
      refused("A plan ends after the age already reached and by 120"),
    );
    expect(await saveAges({ ends: 37, retires: 37 })).toStrictEqual(
      saved({ ends: 37, retires: 37 }),
    );
    expect(await saveAges({ ends: 120 })).toStrictEqual(
      saved({ ends: 120, retires: 37 }),
    );
    expect(await readLatest(db)).toMatchObject({ version: 2 });
  });

  // The household holds a plan to 35, which its owner of 36 has already
  // outlived, as a plan saved years ago would. It is kept as it is rather
  // than held to today again, so a retirement age saved beside it
  // stands, while one past it is still refused.
  it("keeps an end age already outlived rather than refusing a retirement age saved beside it", async () => {
    await keepAfter(db, 0, { ...blank, ages: { ends: 35, retires: 34 } });

    expect(await saveAges({ retires: 30 })).toStrictEqual(
      saved({ ends: 35, retires: 30 }),
    );
    await expect(saveAges({ retires: 36 })).resolves.toStrictEqual(
      refused("A plan's owner retires no later than it ends"),
    );
  });

  // A retirement already past says only that nothing is earned by
  // working, so 30 is sound for someone of 36.
  it("holds the retirement age to the plan's end, but not to the age reached", async () => {
    await expect(saveAges({ retires: 90 })).resolves.toStrictEqual(
      refused("A plan's owner retires no later than it ends"),
    );
    await expect(saveAges({ ends: 58 })).resolves.toStrictEqual(
      refused("A plan's owner retires no later than it ends"),
    );
    expect(await saveAges({ retires: 30 })).toStrictEqual(
      saved({ ends: 89, retires: 30 }),
    );
    expect(await readLatest(db)).toMatchObject({ version: 1 });
  });
});
