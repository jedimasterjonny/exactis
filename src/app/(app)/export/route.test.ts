// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { Kept } from "@/data/household";

import { blank, kept as reference, today } from "@/data/household.fixture";
import { stamped } from "@/data/shapes";
import { keepAfter } from "@/db/household";
import { inMemory } from "@/db/memory.fixture";
import { standUp } from "@/db/store.fixture";
import { openedScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";

import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: vi.fn() }));
vi.mock("@/lib/scenario", () => ({ openedScenario: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireSession: vi.fn() }));

const memory = inMemory();
const { db } = memory;

standUp(memory, { today });

// What the file handed out holds, read back as the browser saves it.
async function bodyOf(response: Response): Promise<unknown> {
  return JSON.parse(await response.text());
}

// Keeps the household given as the first version of the branch named.
async function keepFirst(scenario: string, household: Kept): Promise<void> {
  await keepAfter(db, { scenario, version: 0 }, household);
}

describe("GET /export", () => {
  it("hands the household out as a file named for it and the day, stamped as a save writes it and never cached", async () => {
    await keepFirst("", reference);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''exactis-household-2026-09-15.json",
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await bodyOf(response)).toStrictEqual(stamped(reference));
  });

  it("hands out the scenario open, named for it", async () => {
    await keepFirst("", reference);
    await keepFirst("Retire early", blank);
    vi.mocked(openedScenario).mockResolvedValue("Retire early");

    const response = await GET();

    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''exactis-Retire%20early-2026-09-15.json",
    );
    expect(await bodyOf(response)).toStrictEqual(stamped(blank));
  });

  // An apostrophe divides the value from its charset, so it and the
  // brackets are escaped where encodeURIComponent leaves them.
  it("escapes every character a scenario's name holds that the header's value cannot", async () => {
    await keepFirst("Sam's plan (early)", blank);
    vi.mocked(openedScenario).mockResolvedValue("Sam's plan (early)");

    expect((await GET()).headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''exactis-Sam%27s%20plan%20%28early%29-2026-09-15.json",
    );
  });

  // A scenario dropped in another tab, as the screen in this one draws
  // it.
  it("hands out the household where the cookie names a scenario no longer kept", async () => {
    await keepFirst("", reference);
    vi.mocked(openedScenario).mockResolvedValue("Dropped");

    const response = await GET();

    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''exactis-household-2026-09-15.json",
    );
    expect(await bodyOf(response)).toStrictEqual(stamped(reference));
  });

  it("hands out the household as it opens before anything is kept", async () => {
    expect(await bodyOf(await GET())).toStrictEqual(stamped(blank));
  });

  it("hands nothing out without a session", async () => {
    await keepFirst("", reference);
    vi.mocked(requireSession).mockRejectedValue(new Error("redirected"));

    await expect(GET()).rejects.toThrow("redirected");
  });
});
