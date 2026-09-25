import "server-only";
import { cacheLife, cacheTag } from "next/cache";

import type { Plan, PlanAges } from "@/data/plan";

import { planOf } from "@/data/plan";
import { getDb } from "@/db/client";
import { findAges } from "@/db/plan";
import { requireSession } from "@/lib/session";

// The tag every read of the plan's ages carries and every write of them
// expires, so a save is seen on the way back from it.
export const planTag = "plan";

// The plan as it stands, from this year and this month of it, to the
// ages the store keeps: what the projection runs on and what the plan
// screen lays its lines over. The ages are read behind the session, as
// the accounts are, and the date after them, so it is read at request
// time.
export async function getPlan(): Promise<Plan> {
  await requireSession();
  return planOf(await readAges(), new Date());
}

// A single user's plan is one entry, and hours is long enough that only
// a save turns it over, which is what the tag is for.
async function readAges(): Promise<PlanAges> {
  "use cache";
  cacheTag(planTag);
  cacheLife("hours");
  return findAges(getDb());
}
