import "server-only";
import { cacheLife, cacheTag } from "next/cache";

import type { Account } from "@/data/accounts";
import type { Plan, PlanAges } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { ProjectionPoint } from "@/engine/projection";

import { getDb } from "@/db/client";
import { findAges } from "@/db/plan";
import { project } from "@/engine/projection";
import { requireSession } from "@/lib/session";
import { getAccounts } from "@/store/accounts";
import { getExpenseLines, getIncomeLines } from "@/store/schedule";

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

// The projection, for whoever is signed in, run over the accounts, the
// two schedules and the plan as the store has them. Each read checks
// the session and is the read a save expires, so a save on either
// screen is seen here on the way back from it too, and all of it goes
// into the projection's key.
export async function getProjection(): Promise<ProjectionPoint[]> {
  const [accounts, income, expenses, plan] = await Promise.all([
    getAccounts(),
    getIncomeLines(),
    getExpenseLines(),
    getPlan(),
  ]);
  return readProjection(accounts, { expenses, income }, plan);
}

// A single user's plan is one entry, and hours is long enough that only
// a save turns it over, which is what the tag is for.
async function readAges(): Promise<PlanAges> {
  "use cache";
  cacheTag(planTag);
  cacheLife("hours");
  return findAges(getDb());
}

// Keyed on what it is run over, so a change to the accounts or the lines
// misses here rather than expiring anything and nothing needs a tag.
// Hours is long enough that only a change turns it over. The engine is
// cheap today; the entry is what keeps it cheap to read when it is not.
//
// eslint-disable-next-line @typescript-eslint/require-await -- "use cache" caches only an async function, and the engine is synchronous
async function readProjection(
  accounts: readonly Account[],
  schedule: Schedule,
  plan: Plan,
): Promise<ProjectionPoint[]> {
  "use cache";
  cacheLife("hours");
  return project(accounts, schedule, plan);
}
