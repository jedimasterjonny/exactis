import "server-only";
import { cacheLife } from "next/cache";

import type { Account } from "@/data/accounts";
import type { Plan } from "@/data/plan";
import type { Schedule } from "@/engine/cash-flow";
import type { ProjectionPoint } from "@/engine/projection";

import { project } from "@/engine/projection";

import { getAccounts } from "./accounts/store";
import { getExpenseLines, getIncomeLines } from "./plan/store";

// The plan, until there is an assumptions screen to set it on: five per
// cent a year, thirty years out from this one, for someone born in 1990.
const born = 1990;

const rate = 0.05;

const years = 30;

// The plan as it stands, from this year and this month of it: what the
// projection runs on and what the plan screen lays its lines over. The
// date is read when the plan is, so it is read at request time.
export function getPlan(): Plan {
  const now = new Date();
  return { born, from: now.getFullYear(), month: now.getMonth(), rate, years };
}

// The projection, for whoever is signed in, run over the accounts and
// the two schedules as the store has them. Each read checks the session
// and is the read a save expires, so a save on either screen is seen
// here on the way back from it too. The plan is read after them, so its
// year is read at request time as they are, and all of it goes into the
// projection's key.
export async function getProjection(): Promise<ProjectionPoint[]> {
  const [accounts, income, expenses] = await Promise.all([
    getAccounts(),
    getIncomeLines(),
    getExpenseLines(),
  ]);
  return readProjection(accounts, { expenses, income }, getPlan());
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
