import "server-only";
import { cacheLife, cacheTag } from "next/cache";

import type { ExpenseLine } from "@/data/expenses";
import type { IncomeLine } from "@/data/income";

import { getDb } from "@/db/client";
import { listExpenseLines } from "@/db/expenses";
import { listIncomeLines } from "@/db/income";
import { requireSession } from "@/lib/session";

// The tag every read of a schedule's lines carries and every write to it
// expires, so a save is seen on the way back from it rather than when the
// cache next turns over. Each schedule has its own, so a save to one
// leaves the other's read where it is.
export const expenseLinesTag = "expense-lines";

export const incomeLinesTag = "income-lines";

// The expense lines, for whoever is signed in, read as the income lines
// are.
export async function getExpenseLines(): Promise<ExpenseLine[]> {
  await requireSession();
  return readExpenseLines();
}

// The income lines, for whoever is signed in. The session is read out
// here, since a cached scope cannot read the request, and the read behind
// it is cached and tagged, so a navigation back finds the list ready. The
// read stays unexported so nothing reaches the store without the session
// read in front of it.
export async function getIncomeLines(): Promise<IncomeLine[]> {
  await requireSession();
  return readIncomeLines();
}

async function readExpenseLines(): Promise<ExpenseLine[]> {
  "use cache";
  cacheTag(expenseLinesTag);
  cacheLife("hours");
  return listExpenseLines(getDb());
}

// A single user's lines are one entry, and hours is long enough that
// only a save turns it over, which is what the tag is for.
async function readIncomeLines(): Promise<IncomeLine[]> {
  "use cache";
  cacheTag(incomeLinesTag);
  cacheLife("hours");
  return listIncomeLines(getDb());
}
