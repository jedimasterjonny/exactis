"use server";

import { updateTag } from "next/cache";
import * as z from "zod";

import type { PlanAges } from "@/data/plan";

import { oldestAge } from "@/data/plan";
import { getDb } from "@/db/client";
import { findAges, writeAges } from "@/db/plan";
import { requireSession } from "@/lib/session";
import { getPlan, planTag } from "@/store/plan";

// What a save may carry: either age or both, each whole and neither
// below nothing, and whichever is not sent is kept as the store has
// it, so the dashboard can move the retirement age without knowing the
// end age, and the other way.
const patch = z.object({
  ends: z.number().int().nonnegative().optional(),
  retires: z.number().int().nonnegative().optional(),
});

// Writes the plan's ages, the ones sent over the ones the store has,
// and hands back the ages as the store now has them. An action answers
// a POST from anywhere, so it checks the session for itself and parses
// what it was sent rather than trusting the form. An end age sent is
// held to a plan that runs: past the age its owner has already reached,
// so it has a year to project, and no later than the oldest age a plan
// may run to. One kept as the store has it is not held there again, so
// an end age the owner has since outlived does not refuse a retirement
// age saved beside it. Whichever is sent, the owner retires no later
// than the plan ends, since the chart can mark a retirement only
// within the plan. A retirement already past is sound, since it says
// only that nothing is earned by working. Each refusal says why, since
// the screen says so under a toast. The tag is expired before
// returning, so the same round trip carries the plan re-read.
export async function saveAges(draft: Partial<PlanAges>): Promise<PlanAges> {
  await requireSession();
  const parsed = patch.parse(draft);
  const db = getDb();
  const stored = await findAges(db);
  const ages = {
    ends: parsed.ends ?? stored.ends,
    retires: parsed.retires ?? stored.retires,
  };
  if (parsed.ends !== undefined) {
    const { born, from } = await getPlan();
    if (parsed.ends <= from - born || parsed.ends > oldestAge) {
      throw new Error(
        `A plan ends after the age already reached and by ${String(oldestAge)}`,
      );
    }
  }
  if (ages.retires > ages.ends) {
    throw new Error("A plan's owner retires no later than it ends");
  }
  const saved = await writeAges(db, ages);
  updateTag(planTag);
  return saved;
}
