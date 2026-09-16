import "server-only";
import { cacheLife, cacheTag } from "next/cache";

import type { IncomeLine } from "@/data/income";

import { getDb } from "@/db/client";
import { listIncomeLines } from "@/db/income";
import { requireSession } from "@/lib/session";

// The tag every read of the income lines carries and every write expires,
// so a save is seen on the way back from it rather than when the cache
// next turns over.
export const incomeLinesTag = "income-lines";

// The income lines, for whoever is signed in. The session is read out
// here, since a cached scope cannot read the request, and the read behind
// it is cached and tagged, so a navigation back finds the list ready. The
// read stays unexported so nothing reaches the store without the session
// read in front of it.
export async function getIncomeLines(): Promise<IncomeLine[]> {
  await requireSession();
  return readIncomeLines();
}

// A single user's lines are one entry, and hours is long enough that
// only a save turns it over, which is what the tag is for.
async function readIncomeLines(): Promise<IncomeLine[]> {
  "use cache";
  cacheTag(incomeLinesTag);
  cacheLife("hours");
  return listIncomeLines(getDb());
}
