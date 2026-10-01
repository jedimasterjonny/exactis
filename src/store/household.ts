import "server-only";
import { refresh } from "next/cache";
import { cache } from "react";

import type { Account } from "@/data/accounts";
import type { Deductions, Vintages } from "@/data/cma";
import type { ExpenseLine } from "@/data/expenses";
import type { Household, Kept } from "@/data/household";
import type { IncomeLine } from "@/data/income";
import type { Curve } from "@/data/inflation";
import type { Milestone } from "@/data/milestones";
import type { Owner } from "@/data/owners";
import type { Plan } from "@/data/plan";
import type { Allocation, Rates, RateSet } from "@/data/rates";
import type { Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { nothingKeptIn, soundKept } from "@/data/household";
import { getDb } from "@/db/client";
import { keepAfter, readLatest } from "@/db/household";
import { Refusal, refused, saved } from "@/lib/answer";
import { thisMonth } from "@/lib/months";
import { requireSession } from "@/lib/session";

// What a save works from: the household as it stands, the whole it makes
// on the day, and the kept household it is written back as.
export interface Held {
  readonly household: Household;
  readonly kept: Kept;
}

// What a save makes of the household: the kept household to write, and
// what the action hands back, which is the record it wrote.
interface Amended<TResult> {
  readonly kept: Kept;
  readonly result: TResult;
}

// The household as it stands, read once a request however many parts of
// a page ask for a part of it. Every part is read out of the one read,
// so a page never lays one version's accounts beside another's lines.
const readHousehold = cache(
  async (): Promise<Household> => (await readHeld()).household,
);

// Saves the household as the edit makes it, and answers with what the
// edit says to hand back. The edit works from the latest version and is
// held to every rule before anything is written, so a save that breaks
// one is answered as a refusal in its words and leaves the store as it
// was, and anything else thrown on the way stays a failure; and the whole household
// is written as the version after the one read, in one statement, so a
// save lands whole or not at all, and a save the household changed
// under since it was read is refused rather than written over what the
// other left. The page the save was made from is drawn again from the
// version written. An action answers a POST from anywhere, so this
// checks the session for itself, as every read does.
export async function amend<TResult>(
  edit: (held: Held) => Amended<TResult>,
): Promise<Answer<TResult>> {
  await requireSession();
  const { version, ...held } = await readHeld();
  try {
    const { kept, result } = edit(held);
    await keepAfter(getDb(), version, soundKept(kept).kept);
    refresh();
    return saved(result);
  } catch (error: unknown) {
    if (error instanceof Refusal) {
      return refused(error.message);
    }
    throw error;
  }
}

export async function getAccounts(): Promise<readonly Account[]> {
  await requireSession();
  return (await readHousehold()).accounts;
}

// How the savings are split between stocks and bonds.
export async function getAllocation(): Promise<Allocation> {
  await requireSession();
  return (await readHousehold()).allocation;
}

// The vintages of BlackRock's capital market assumptions last pulled,
// or none before one is.
export async function getCma(): Promise<null | Vintages> {
  await requireSession();
  return (await readHousehold()).cma;
}

// The inflation curve last pulled from the Bank, or none before one is.
export async function getCurve(): Promise<Curve | null> {
  await requireSession();
  return (await readHousehold()).curve;
}

// What comes off the CMA's returns to derive the rates from them.
export async function getDeductions(): Promise<Deductions> {
  await requireSession();
  return (await readHousehold()).deductions;
}

export async function getExpenseLines(): Promise<readonly ExpenseLine[]> {
  await requireSession();
  return (await readHousehold()).schedule.expenses;
}

export async function getIncomeLines(): Promise<readonly IncomeLine[]> {
  await requireSession();
  return (await readHousehold()).schedule.income;
}

// The rates the plan runs on as it is: the ones typed, or the CMA's
// when they are chosen.
export async function getLiveRates(): Promise<Rates> {
  await requireSession();
  return (await readHousehold()).liveRates;
}

export async function getMilestones(): Promise<readonly Milestone[]> {
  await requireSession();
  return (await readHousehold()).milestones;
}

export async function getOwners(): Promise<readonly Owner[]> {
  await requireSession();
  return (await readHousehold()).owners;
}

// The plan as it stands, from the month the household's balances are
// as of.
export async function getPlan(): Promise<Plan> {
  await requireSession();
  return (await readHousehold()).plan;
}

// The rates typed by hand, whether or not the plan runs on them.
export async function getRates(): Promise<Rates> {
  await requireSession();
  return (await readHousehold()).rates;
}

// Which set of rates the plan runs on.
export async function getRateSet(): Promise<RateSet> {
  await requireSession();
  return (await readHousehold()).rateSet;
}

// The target allocation last imported from Portfolio Performance, or
// none before one is.
export async function getTargets(): Promise<null | Targets> {
  await requireSession();
  return (await readHousehold()).targets;
}

// The latest version the store has kept, or the household before
// anything is saved, its balances as of this month, held to every rule as it is today, so a version the
// rules have since tightened past is refused in their words rather than
// handed to the engine to throw on, and with the version it is, which a
// save writes the one after. The month is read at request time, since
// the session is read before anything that reads it.
async function readHeld(): Promise<Held & { readonly version: number }> {
  const latest = await readLatest(getDb());
  return {
    ...soundKept(latest?.household ?? nothingKeptIn(thisMonth())),
    version: latest?.version ?? 0,
  };
}
