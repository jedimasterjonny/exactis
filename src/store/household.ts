import "server-only";
import { refresh } from "next/cache";
import { cache } from "react";

import type { Household, Kept } from "@/data/household";
import type { Before } from "@/data/moves";
import type { Read, Version } from "@/db/household";
import type { Answer } from "@/lib/answer";

import { nothingKeptIn, soundKept, sourcesIn } from "@/data/household";
import { getDb } from "@/db/client";
import { keepAfter, listScenarios, readAsOf, readLatest } from "@/db/household";
import { Refusal, refused, saved } from "@/lib/answer";
import { dayOf, monthBefore, thisMonth } from "@/lib/months";
import { openedScenario } from "@/lib/scenario";
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

// The branch a request has open and its latest version, or null before
// anything is kept there: the household is the scenario with no name.
interface Open {
  readonly latest: null | Version;
  readonly scenario: string;
}

// What a page reads, each read once a request however many parts of the
// page ask for it, so a page never lays one version's accounts beside
// another's lines, nor a scenario's name over the household's figures:
// the branch open, the household as it stands there, and the household
// itself, for the dashboard to set beside a scenario. Whether React's
// cache carries from an action into the render its refresh() asks for
// is not known here, so these are for a page's reads: what an action
// writes from is read afresh, the cookie as much as the store, as amend
// reads it, since a read cached in the action could otherwise be drawn
// by the page in place of what the action wrote. The names of the
// scenarios kept are read once a request too.
const readPage = cache(async (): Promise<Open> => readOpen(false));
const readHousehold = cache(
  async (): Promise<Household> => heldIn(await readPage()).household,
);
const readBaseline = cache(
  async (): Promise<Household> =>
    heldIn({ latest: await readLatest(getDb(), ""), scenario: "" }).household,
);
const readScenarios = cache(async (): Promise<readonly string[]> =>
  listScenarios(getDb()),
);

// Saves the household as the edit makes it, and answers with what the
// edit says to hand back. The edit works from the latest version and is
// held to every rule before anything is written, so a save that breaks
// one is answered as a refusal in its words and leaves the store as it
// was, and anything else thrown on the way stays a failure; and the whole household
// is written as the version after the one read, in one statement, so a
// save lands whole or not at all, and a save the household changed
// under since it was read is refused rather than written over what the
// other left. The household is read and written on the branch open, so
// an edit made in a scenario is kept in the scenario, and one made from
// a page drawn in a scenario dropped since is refused rather than kept
// in the household; so is one read from a version the rules have since
// tightened past, in their words. The page the save was made from is
// drawn again from the version written. An action answers a POST from
// anywhere, so this checks the session for itself, as every read does.
export async function amend<TResult>(
  edit: (held: Held) => Amended<TResult>,
): Promise<Answer<TResult>> {
  await requireSession();
  try {
    const { scenario, version, ...held } = heldIn(await readOpen(true));
    const { kept, result } = edit(held);
    await keepAfter(getDb(), { scenario, version }, soundKept(kept).kept);
    refresh();
    return saved(result);
  } catch (error: unknown) {
    if (error instanceof Refusal) {
      return refused(error.message);
    }
    throw error;
  }
}

// The household itself as it stands, whatever branch is open, for the
// dashboard to set a scenario beside.
export async function getBaseline(): Promise<Household> {
  await requireSession();
  return readBaseline();
}

export async function getHousehold(): Promise<Household> {
  await requireSession();
  return readHousehold();
}

// The name of the scenario open, or null while the household is.
export async function getScenario(): Promise<null | string> {
  await requireSession();
  const { scenario } = await readPage();
  return scenario === "" ? null : scenario;
}

// The names of the scenarios kept, in order.
export async function getScenarios(): Promise<readonly string[]> {
  await requireSession();
  return readScenarios();
}

// The sources the CMA-derived rates rested on as the household stood so
// many days ago on the branch open, and the day that version was saved
// on, as the UK names it, to say what has moved them since; or null
// before anything is kept, or where the sources kept then break a rule
// since tightened, which leaves nothing to compare. A scenario made
// since then had no version so many days ago, so the household's is
// read, as readAsOf reads it. The vintage
// before the latest one kept then is left out, since no comparison reads
// it and the page would carry it to the browser for nothing. The session
// is checked first, as every read's is.
export async function getSourcesDaysAgo(days: number): Promise<Before | null> {
  await requireSession();
  const kept = await readAsOf(
    getDb(),
    (await readPage()).scenario,
    new Date(Date.now() - days * 86_400_000),
  );
  const sources = kept === null ? null : sourcesIn(kept.household);
  return kept === null || sources === null
    ? null
    : {
        savedOn: dayOf(kept.savedAt),
        sources: {
          ...sources,
          cma: sources.cma && { latest: sources.cma.latest, previous: null },
        },
      };
}

// The household held on the branch open, with the branch and the
// version it is there, read afresh, as a save reads it, so a cookie
// naming a scenario no longer kept is refused as a save's is: for an
// action that writes from the household open other than through amend,
// as a scenario is made from it. The session is checked first, as every
// read's is.
export async function readHeld(): Promise<Held & Read> {
  await requireSession();
  return heldIn(await readOpen(true));
}

// The latest version kept on a branch, or the household before anything
// is saved, its balances as of the end of the month before this one, so
// that its plan starts in this one, held to every rule as it is today,
// so a version the rules have since tightened past is refused in their
// words rather than handed to the engine to throw on, and with the
// branch and the version it is, which a save writes the one after. The
// month is read at request time, since the session is read before
// anything that reads it.
function heldIn({ latest, scenario }: Open): Held & Read {
  return {
    ...soundKept(latest?.household ?? nothingKeptIn(monthBefore(thisMonth()))),
    scenario,
    version: latest?.version ?? 0,
  };
}

// The branch open and its latest version, read afresh: the scenario the
// cookie names where the store keeps one by that name, and the household
// where it names none. A name no scenario is kept under, as one dropped
// in another tab, reads as the household for a page, so its banner goes
// on the next render; but a save from a page drawn in it is refused, so
// what was meant for a scenario is never kept in the household.
async function readOpen(isSaving: boolean): Promise<Open> {
  const db = getDb();
  const name = await openedScenario();
  if (name !== null) {
    const latest = await readLatest(db, name);
    if (latest !== null) {
      return { latest, scenario: name };
    }
    if (isSaving) {
      throw new Refusal("No scenario is kept under that name");
    }
  }
  return { latest: await readLatest(db, ""), scenario: "" };
}
