"use server";

import { refresh } from "next/cache";
import * as z from "zod";

import type { Account } from "@/data/accounts";
import type { Kept } from "@/data/household";
import type { Answer } from "@/lib/answer";

import { soundKept } from "@/data/household";
import { recordId, scenarioName } from "@/data/schemas";
import { upcast } from "@/data/shapes";
import { getDb } from "@/db/client";
import { dropScenario, keepAfter, readFirst, readLatest } from "@/db/household";
import { Refusal, refused, saved } from "@/lib/answer";
import { closeScenario, openedScenario, openScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";
import { readHeld } from "@/store/household";

// Why a scenario named is not there to enter or adopt: none was ever
// kept by that name, or it has been dropped since the screen was drawn.
const unkept = "No scenario is kept under that name";

// The id the next record is given, read off the copy a scenario was made
// from and nothing else: the copy was sound when it was kept, and a rule
// tightened since would otherwise refuse an adoption it has no part in.
const fork = z.object({ next: recordId });

// Every action here answers a POST from anywhere, so it checks the
// session for itself and parses the name it was sent rather than
// trusting the form; a name no scenario could have, empty or too long,
// is a post only a bug or a forgery sends, and fails. Each reads the
// cookie and the store afresh rather than through the page's cached
// reads, and draws the page again from what it wrote.

// Keeps the scenario's plan over the household's bookkeeping as the
// household's next version, under the household's own check that
// nothing was saved to it since it was read, then drops the versions of
// the scenario up to the one adopted, and closes it where it is the one
// open. So balances and progress points recorded in the household while
// the scenario was explored are kept rather than rolled back, as the
// merge below says; and a version saved to the scenario after it was
// read stays, rather than vanishing unseen. Both sides are read from the
// store, so each is carried to this shape by the chain first, and one a
// newer app kept is refused; the merge is made in memory and is not.
// Both, and what they make, are held to every rule as any save is, so
// one kept before a rule tightened, or a merge breaking one, is refused
// in the rule's words.
// An account added to the household since the scenario was made is
// refused rather than merged, as the merge below says, and the
// scenario's first version, the copy it was made from, is read for the
// id its next record was given to tell.
// The store runs no transaction, so the write comes first: a drop that
// fails after it leaves a scenario already adopted, and nothing lost.
export async function adoptScenario(name: string): Promise<Answer<undefined>> {
  await requireSession();
  const scenario = scenarioName.parse(name);
  const db = getDb();
  const [adopted, forked, household] = await Promise.all([
    readLatest(db, scenario),
    readFirst(db, scenario),
    readLatest(db, ""),
  ]);
  if (adopted === null || forked === null) {
    return refused(unkept);
  }
  try {
    const plan = soundKept(upcast(adopted.household)).kept;
    await keepAfter(
      db,
      { scenario: "", version: household?.version ?? 0 },
      soundKept(
        household === null
          ? plan
          : planOver(
              soundKept(upcast(household.household)).kept,
              plan,
              fork.parse(upcast(forked.household)).next,
            ),
      ).kept,
    );
  } catch (error: unknown) {
    if (error instanceof Refusal) {
      return refused(error.message);
    }
    throw error;
  }
  await dropScenario(db, scenario, adopted.version);
  await closeIfOpen(scenario);
  refresh();
  return saved(undefined);
}

// Makes a scenario of the name typed from the household open, its kept
// version copied whole as the scenario's first, and opens it, handing
// back the name as kept. The household open may itself be a scenario,
// so one is made from another as readily as from the household. A name
// a scenario is kept under already is refused, and so is a household
// open that breaks a rule since tightened, or a scenario open that has
// been dropped since, each in its own words, as adopting is; the second
// of two made under one name at once is refused as any save that lost a
// race is.
export async function createScenario(name: string): Promise<Answer<string>> {
  await requireSession();
  const scenario = scenarioName.parse(name);
  const db = getDb();
  if ((await readLatest(db, scenario)) !== null) {
    return refused("A scenario is kept under that name already");
  }
  try {
    const { kept } = await readHeld();
    await keepAfter(db, { scenario, version: 0 }, kept);
  } catch (error: unknown) {
    if (error instanceof Refusal) {
      return refused(error.message);
    }
    throw error;
  }
  await openScenario(scenario);
  refresh();
  return saved(scenario);
}

// Drops every version of the scenario named, and closes it where it is
// the one open, so a scenario made later under the name does not open
// itself. A name kept under nothing leaves nothing to drop, and is
// answered as dropped.
export async function deleteScenario(name: string): Promise<Answer<undefined>> {
  await requireSession();
  const scenario = scenarioName.parse(name);
  await dropScenario(getDb(), scenario);
  await closeIfOpen(scenario);
  refresh();
  return saved(undefined);
}

// Opens the scenario named, handing back its name.
export async function enterScenario(name: string): Promise<Answer<string>> {
  await requireSession();
  const scenario = scenarioName.parse(name);
  if ((await readLatest(getDb(), scenario)) === null) {
    return refused(unkept);
  }
  await openScenario(scenario);
  refresh();
  return saved(scenario);
}

// Closes the scenario open, so the household is read again. Posted from
// a form drawn on the server, so it works before the page hydrates, and
// takes the form's data and reads none of it.
export async function leaveScenario(): Promise<void> {
  await requireSession();
  await closeScenario();
  refresh();
}

// An account of the scenario's, with the balance the household holds
// for it and the day that balance was set, where it was dated; one the
// household holds undated keeps the scenario's day, as a save leaves an
// undated balance's day as it was.
function balancedAs(account: Account, kept: Account): Account {
  return {
    ...account,
    balance: kept.balance,
    ...(kept.setOn !== undefined && { setOn: kept.setOn }),
  };
}

// Closes the scenario named where it is the one the request has open.
async function closeIfOpen(name: string): Promise<void> {
  if ((await openedScenario()) === name) {
    await closeScenario();
  }
}

// The household a scenario leaves when it is adopted: the scenario's
// plan over the household's bookkeeping. The bookkeeping is what was
// recorded of the household rather than planned for it: each account's
// balance and the day it was set, the month the balances are as of, the
// progress points, and what was pulled from outside, the house price
// index, the CMA and the inflation curve. The rest is the plan, and the
// scenario's: the owners, the accounts and what pays into them, the
// milestones, both schedules, the ages, the rates typed and which set
// is live, the drawdown, the split, the glide path, the deductions, the target
// allocation and its mappings, and the next record's id. Balances go by
// the account's id: an account in both takes the household's balance,
// one only the scenario holds keeps its own, and one only the household
// holds is gone, since the scenario deleted it. That holds only while
// the household holds no account added since the scenario was made:
// each branch gives its next record the id the household's next stood
// at when the scenario was made, so an account added to each would be
// read as one, the scenario's taking the household's balance and the
// household's gone unsaid, and one added to the household alone would
// go unsaid too. A household holding an account with an id from that
// one on is refused, so the operator takes the account out of the
// household and puts it back after. The merged household gives its next
// record the higher of the two ids, since an id only ever counts up:
// the household's next stays where an account it took out had moved it,
// and a file imported into the scenario can set the scenario's lower.
function planOver(household: Kept, scenario: Kept, forkedAt: number): Kept {
  if (household.accounts.some(({ id }) => id >= forkedAt)) {
    throw new Refusal(
      "An account was added to the household since this scenario was made, so the scenario cannot be laid over it; delete it from the household first, and add it again after",
    );
  }
  return {
    ...scenario,
    accounts: scenario.accounts.map((account) => {
      const kept = household.accounts.find(({ id }) => id === account.id);
      return kept === undefined ? account : balancedAs(account, kept);
    }),
    asOf: household.asOf,
    cma: household.cma,
    curve: household.curve,
    housePrices: household.housePrices,
    next: Math.max(household.next, scenario.next),
    points: household.points,
  };
}
