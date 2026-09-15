import "server-only";
import { cacheLife } from "next/cache";

import type { Account } from "@/data/accounts";
import type { Plan, ProjectionPoint } from "@/engine/projection";

import { project } from "@/engine/projection";

import { getAccounts } from "./accounts/store";

// The plan, until there is an assumptions screen to set it on: five per
// cent a year, thirty years out from this one, for someone born in 1990.
const born = 1990;

const rate = 0.05;

const years = 30;

// The projection, for whoever is signed in, run over the accounts as the
// store has them. The accounts read checks the session and is the read a
// save expires, so a save is seen here on the way back from it too. The
// year is read after that, so it is read at request time as the accounts
// are, and both go into the projection's key.
export async function getProjection(): Promise<ProjectionPoint[]> {
  const accounts = await getAccounts();
  const from = new Date().getFullYear();
  return readProjection(accounts, { born, from, rate, years });
}

// Keyed on what it is run over, so a change to the accounts misses here
// rather than expiring anything and nothing needs a tag. Hours is long
// enough that only a change turns it over. The engine is cheap today; the
// entry is what keeps it cheap to read when it is not.
//
// eslint-disable-next-line @typescript-eslint/require-await -- "use cache" caches only an async function, and the engine is synchronous
async function readProjection(
  accounts: readonly Account[],
  plan: Plan,
): Promise<ProjectionPoint[]> {
  "use cache";
  cacheLife("hours");
  return project(accounts, plan);
}
