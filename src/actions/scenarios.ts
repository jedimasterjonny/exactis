"use server";

import { refresh } from "next/cache";

import type { Answer } from "@/lib/answer";

import { soundKept } from "@/data/household";
import { scenarioName } from "@/data/schemas";
import { upcast } from "@/data/shapes";
import { getDb } from "@/db/client";
import {
  decideScenario,
  dropScenario,
  keepAfter,
  readFirst,
  readLatest,
} from "@/db/household";
import { Refusal, refused, saved } from "@/lib/answer";
import { fork, planOver } from "@/lib/plan-over";
import { closeScenario, openedScenario, openScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";
import { readHeld } from "@/store/household";

// Why a scenario named is not there to enter or adopt: none was ever
// kept by that name, or it has been dropped since the screen was drawn.
const unkept = "No scenario is kept under that name";

// Every action here answers a POST from anywhere, so it checks the
// session for itself and parses the name it was sent rather than
// trusting the form; a name no scenario could have, empty or too long,
// is a post only a bug or a forgery sends, and fails. Each reads the
// cookie and the store afresh rather than through the page's cached
// reads, and draws the page again from what it wrote.

// Keeps the scenario's plan over the household's bookkeeping as the
// household's next version, under the household's own check that
// nothing was saved to it since it was read, then keeps the scenario as
// made the household, the version adopted copied as its next with the
// decision on it, and closes it where it is the one open. So balances
// and progress points recorded in the household while the scenario was
// explored are kept rather than rolled back, as planOver says;
// and the scenario stays to be read back, taking no more saves. Both
// sides are read from the store, so each is carried to this shape by
// the chain first, and one a newer app kept is refused; the merge is
// made in memory and is not. Both, and what they make, are held to
// every rule as any save is, so one kept before a rule tightened, or a
// merge breaking one, is refused in the rule's words. A scenario made
// the household already is refused, since its plan laid over the
// household again would undo every edit made there since.
// An account added to the household since the scenario was made is
// refused rather than merged, as planOver says, and the
// scenario's first version, the copy it was made from, is read for the
// id its next record was given to tell.
// The store runs no transaction, so the household is written first, and
// the answer says whether the decision was kept after it: a decision
// that fails once the household is written, refused because a save
// reached the scenario after it was read or failed outright, leaves the
// adoption standing and the scenario undecided, holding whatever was
// saved to it, which is answered as saved rather than as a failure that
// would say the household was not replaced. The refusal is a race, and
// said in the answer; any other failure is a fault the answer cannot
// tell apart from it, so it is written to the server's log as well,
// where a failed query keeps its statement and none of its values.
export async function adoptScenario(name: string): Promise<Answer<boolean>> {
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
  if (adopted.decided?.decision === "adopted") {
    return refused("This scenario was made the household already");
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
  const isDecided = await decideScenario(
    db,
    { scenario, version: adopted.version },
    { decision: "adopted", reason: null },
  ).then(
    () => true,
    (error: unknown) => {
      if (!(error instanceof Refusal)) {
        console.error(
          "A scenario was made the household, but its decision could not be kept",
          error,
        );
      }
      return false;
    },
  );
  await closeIfOpen(scenario);
  refresh();
  return saved(isDecided);
}

// Makes a scenario of the name typed from the household open, its kept
// version copied whole as the scenario's first, and opens it, handing
// back the name as kept. The household open may itself be a scenario,
// so one is made from another as readily as from the household, a
// decided one among them, which is how a decided scenario is changed. A
// name a scenario is kept under already is refused, decided or not, so a
// name comes free only once its scenario is deleted; and so is a
// household open that breaks a rule since tightened, or a scenario open that has
// been dropped since, each in its own words, as adopting is; the second
// of two made under one name at once is refused as any save that lost a
// race is.
export async function createScenario(name: string): Promise<Answer<string>> {
  await requireSession();
  const scenario = scenarioName.parse(name);
  const db = getDb();
  if ((await readLatest(db, scenario)) !== null) {
    return refused(
      "A scenario is kept under that name already, decided or not",
    );
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

// Drops every version of the scenario named, its decisions with them,
// and closes it where it is the one open, so a scenario made later under
// the name does not open itself. A name kept under nothing leaves nothing to drop, and is
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

// Closes the scenario named where it is the one the request has open.
async function closeIfOpen(name: string): Promise<void> {
  if ((await openedScenario()) === name) {
    await closeScenario();
  }
}
