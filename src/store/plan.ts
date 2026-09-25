import "server-only";
import { cacheLife, cacheTag } from "next/cache";

import type { Plan, PlanAges } from "@/data/plan";

import { getDb } from "@/db/client";
import { findAges } from "@/db/plan";
import { requireSession } from "@/lib/session";

// The tag every read of the plan's ages carries and every write of them
// expires, so a save is seen on the way back from it.
export const planTag = "plan";

// The rest of the plan, until there is somewhere to set it: five per
// cent a year, for someone born in 1990.
const born = 1990;

const rate = 0.05;

// The plan as it stands, from this year and this month of it, to the
// age the store says it runs to and with the age it says its owner
// retires at: what the projection runs on and what the plan screen
// lays its lines over. The ages are read behind the session, as the
// accounts are, and the date after them, so it is read at request
// time. A plan whose age is already reached runs no years forward
// rather than a count below nothing.
export async function getPlan(): Promise<Plan> {
  await requireSession();
  const { ends, retires } = await readAges();
  const now = new Date();
  const from = now.getFullYear();
  return {
    born,
    from,
    month: now.getMonth(),
    rate,
    retires,
    years: Math.max(0, born + ends - from),
  };
}

// A single user's plan is one entry, and hours is long enough that only
// a save turns it over, which is what the tag is for.
async function readAges(): Promise<PlanAges> {
  "use cache";
  cacheTag(planTag);
  cacheLife("hours");
  return findAges(getDb());
}
