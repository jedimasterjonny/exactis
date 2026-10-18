import { afterAll, beforeAll, beforeEach, vi } from "vitest";

import type { Kept } from "@/data/household";
import type { Memory } from "@/db/memory.fixture";

import { getDb } from "@/db/client";
import { keepAfter } from "@/db/household";
import { openedScenario } from "@/lib/scenario";

// What a test of a save stands the store up with: the day the clock
// reads, for a save that reads the month it is, and the household kept
// as the first version, for a save that writes over one.
interface Standing {
  readonly seed?: Kept;
  readonly today?: Date;
}

// The store in memory stood in for the client's, for the tests of what
// reads and writes through the client: readied once a file, emptied
// before each test and handed to whatever asks the client for the
// database, on the day given and holding the household given, if any,
// with no scenario open, so a request reads and writes the household.
// Each file mocks the client and the scenario's cookie itself, since a
// mock is hoisted to the file that makes it, and calls this inside the
// describe it stands the store up for, so the hooks are that describe's.
export function standUp(
  { close, db, empty, ready }: Memory,
  { seed, today }: Standing = {},
): void {
  beforeAll(ready);
  beforeEach(async () => {
    await empty();
    vi.mocked(getDb).mockReturnValue(db);
    vi.mocked(openedScenario).mockResolvedValue(null);
    if (today !== undefined) {
      vi.useFakeTimers({ now: today, toFake: ["Date"] });
    }
    if (seed !== undefined) {
      await keepAfter(db, { scenario: "", version: 0 }, seed);
    }
  });
  afterAll(close);
}
