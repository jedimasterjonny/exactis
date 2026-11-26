"use server";

import { refresh } from "next/cache";
import * as z from "zod";

import type { Kept } from "@/data/household";
import type { Targets } from "@/data/targets";
import type { Database } from "@/db/client";
import type { StoredPortfolio } from "@/db/portfolio";
import type { Answer } from "@/lib/answer";

import { soundKept } from "@/data/household";
import { maxPortfolioBytes, portfolioTooLarge } from "@/data/portfolio";
import { decisionReason, scenarioName } from "@/data/schemas";
import { upcast } from "@/data/shapes";
import { getDb } from "@/db/client";
import {
  decideScenario,
  dropScenario,
  keepAfter,
  readFirst,
  readHighestNext,
  readLatest,
} from "@/db/household";
import { keepPortfolioAfter, readLatestPortfolio } from "@/db/portfolio";
import { answerOf, Refusal, refused, saved, Stale } from "@/lib/answer";
import { forkOf, planOver } from "@/lib/plan-over";
import {
  readPortfolioSnapshot,
  readTargets,
  reweighted,
} from "@/lib/portfolio-file";
import { closeScenario, openedScenario, openScenario } from "@/lib/scenario";
import { requireSession } from "@/lib/session";
import { readHeld } from "@/store/household";

// What making a scenario the household answers with once the household
// has been updated: whether the scenario's decision was kept, and
// whether any needed reweighting of the household's .portfolio file
// landed.
interface Adopted {
  readonly isDecided: boolean;
  readonly isPortfolioSynced: boolean;
}

// What adopting a retargeted scenario prepares to write to the
// household's .portfolio file alongside the rounded shares aligned onto
// the merged household's target allocation.
interface PortfolioReweight {
  readonly afterVersion: number;
  readonly content: Uint8Array<ArrayBuffer>;
  readonly fileName: string;
  readonly targets: Targets;
}

// How the stored .portfolio file stands beside the merged scenario's
// target shares: already matching (with exact stored floats aligned),
// ready to rewrite in place, or incompatible / unable to sync.
type PortfolioReweightPlan =
  | { readonly kind: "matched"; readonly targets: Targets }
  | { readonly kind: "reweight"; readonly reweight: PortfolioReweight }
  | { readonly kind: "unsynced" };

// What a decision was made against: the versions of the household and
// of the scenario the page deciding it was drawn from, the household's
// nought where none was kept.
interface Shown {
  readonly household: number;
  readonly scenario: number;
}

// Why a reason sent is refused: a reason past its length, or one holding
// a control character or a line break, which the field holds back the
// first of and never types the second.
const unreasoned = "A reason is one line of up to 200 characters";

// Why a scenario named is not there to enter or adopt: none was ever
// kept by that name, or it has been dropped since the screen was drawn.
const unkept = "No scenario is kept under that name";

// Server log prefix when a secondary .portfolio reweight fails after
// the household adoption itself has committed.
const portfolioUnsynced =
  "A scenario was made the household, but the portfolio file's target weights could not be updated";

// How close two target shares must be to treat the stored .portfolio
// file as already matching the adopted scenario's weights.
const shareTolerance = 1e-9;

// The versions a decision was drawn from, as a page sends them.
const shownAt = z.object({
  household: z.number().int().nonnegative(),
  scenario: z.number().int().positive(),
});

// Every action here answers a POST from anywhere, so it checks the
// session for itself and parses the name it was sent rather than
// trusting the form; a name no scenario could have, empty or too long,
// is a post only a bug or a forgery sends, and fails. Each reads the
// cookie and the store afresh rather than through the page's cached
// reads, and draws the page again from what it wrote.

// Keeps the scenario's plan over the household's bookkeeping as the
// household's next version, under the household's own check that
// nothing was saved to it since it was read, updates the household's
// .portfolio file when the adopted target shares differ from it and are
// compatible with its taxonomy, then keeps the scenario as made the
// household, the version adopted copied as its next with the decision
// and the reason given on it, and closes it where it is the one open.
// So balances and progress points recorded in the household while the
// scenario was explored, and the portfolio holdings since, are kept
// rather than rolled back, and so is the newer CMA and curve of the
// two, wherever each was pulled, as planOver says; and the scenario
// stays to be read back, taking no more saves. It is decided against
// the versions of both the page deciding it was drawn from, so where
// either has moved since, the figures the page showed are not what
// would be written, and it is refused as stale, the page drawn again
// from what is kept now. Both sides are read from the store, so each is
// carried to this shape by the chain first, and one a newer app kept is
// refused; the merge is made in memory and is not. Both, and what they
// make, are held to every rule as any save is, so one kept before a
// rule tightened, or a merge breaking one, is refused in the rule's
// words. A scenario made the household already is refused, since its
// plan laid over the household again would undo every edit made there
// since; one decided against can be made the household after all. A
// reason past its length or holding a line break is refused, and none
// typed is kept as none.
// An account the household holds that was not in the scenario when it
// was made, or a target allocation synced there since that lists other
// categories with a target above 0%, is refused rather than merged, as
// planOver says, and the scenario's first version, the copy it was made
// from, is read for the ids of its accounts to tell the account.
// The store runs no transaction, so the household is written first, and
// the answer says whether any prepared .portfolio reweight and the
// scenario's decision were kept after it: either failing once the
// household is written leaves the adoption standing and is answered as
// saved rather than as a failure that would say the household was not
// replaced. A concurrent .portfolio write is retried once against the
// latest stored file; any non-Refusal failure on either secondary write
// is written to the server's log as well, where a failed query keeps
// its statement and none of its values.
export async function adoptScenario(
  name: string,
  shown: Shown,
  reason?: string,
): Promise<Answer<Adopted>> {
  await requireSession();
  const scenario = scenarioName.parse(name);
  const against = shownAt.parse(shown);
  const why = decisionReason.safeParse(reason);
  if (!why.success) {
    return refused(unreasoned);
  }
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
  const moved = movedSince(against, household?.version ?? 0, adopted.version);
  if (moved !== null) {
    refresh();
    return refused(moved);
  }
  let reweightPlan: null | PortfolioReweightPlan = null;
  try {
    const plan = soundKept(upcast(adopted.household)).kept;
    const merged =
      household === null
        ? plan
        : planOver(
            soundKept(upcast(household.household)).kept,
            plan,
            forkOf(forked.household),
          );
    if (merged.targets !== null) {
      const stored = await readLatestPortfolio(db);
      if (stored !== null) {
        reweightPlan = preparePortfolioReweight(stored, merged.targets);
      }
    }
    const alignedMerged = alignedForPlan(merged, reweightPlan);
    const keptMerged = soundKept(alignedMerged).kept;
    await keepAfter(
      db,
      { scenario: "", version: household?.version ?? 0 },
      keptMerged,
    );
  } catch (error: unknown) {
    if (error instanceof Refusal) {
      return refused(error.message);
    }
    throw error;
  }
  const isPortfolioSynced = await syncForPlan(db, reweightPlan);
  const isDecided = await decideScenario(
    db,
    { scenario, version: adopted.version },
    { decision: "adopted", reason: why.data },
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
  return saved({ isDecided, isPortfolioSynced });
}

// How far a new scenario's own ids start above the highest next id any
// branch keeps.
// ponytail: a scenario's ids start 2,000 above the highest next kept, so
// about 500 scenarios can be made under idsBelow's 1,000,000. Deleting
// any but the newest frees nothing, and past it New scenario is refused in
// the cap's words. Renumber a branch's ids, or raise the cap, if a
// household nears it.
const scenarioGap = 2_000;

// Makes a scenario of the name typed from the household open, its kept
// version copied whole as the scenario's first but for its next id,
// which starts scenarioGap above the highest next id any branch's latest
// version keeps, so the records the scenario adds take ids no other
// branch has given out, and opens it, handing back the name as kept. The
// household open may itself be a scenario, so one is made from another
// as readily as from the household, a decided one among them, which is
// how a decided scenario is changed. A name a scenario is kept under
// already is refused, decided or not, so a name comes free only once its
// scenario is deleted; and so is a household open that breaks a rule
// since tightened, or a scenario open that has been dropped since, each
// in its own words, as adopting is, and a copy whose next id would pass
// the cap on ids, in the cap's; the second of two made under one name at
// once is refused as any save that lost a race is.
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
    const [{ kept }, highest] = await Promise.all([
      readHeld(),
      readHighestNext(db),
    ]);
    await keepAfter(
      db,
      { scenario, version: 0 },
      soundKept({ ...kept, next: Math.max(kept.next, highest) + scenarioGap })
        .kept,
    );
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

// Keeps the scenario named as decided against, the version the page
// deciding it was drawn from copied as its next with the decision and
// the reason given on it, and closes it where it is the one open. The
// household is not touched, and the scenario is not held to the rules,
// so one the rules have tightened past since can still be decided
// against. It is decided against the versions of both the page was drawn
// from, and refused as stale where either has moved since, as making it
// the household is; and a scenario decided already is refused, since
// nobody decides the same way twice, and one made the household runs
// the household's plan. A reason past its length or holding a line
// break is refused, and none typed is kept as none.
export async function rejectScenario(
  name: string,
  shown: Shown,
  reason?: string,
): Promise<Answer<undefined>> {
  await requireSession();
  const scenario = scenarioName.parse(name);
  const against = shownAt.parse(shown);
  const why = decisionReason.safeParse(reason);
  if (!why.success) {
    return refused(unreasoned);
  }
  const db = getDb();
  const [latest, household] = await Promise.all([
    readLatest(db, scenario),
    readLatest(db, ""),
  ]);
  if (latest === null) {
    return refused(unkept);
  }
  if (latest.decided !== undefined) {
    return refused("This scenario is decided already");
  }
  const moved = movedSince(against, household?.version ?? 0, latest.version);
  if (moved !== null) {
    refresh();
    return refused(moved);
  }
  try {
    await decideScenario(
      db,
      { scenario, version: latest.version },
      { decision: "rejected", reason: why.data },
    );
  } catch (error: unknown) {
    if (error instanceof Refusal) {
      return refused(error.message);
    }
    throw error;
  }
  await closeIfOpen(scenario);
  refresh();
  return saved(undefined);
}

// Applies the aligned target shares prepared by the portfolio reweight
// plan onto the merged household before saving.
function alignedForPlan(
  merged: Kept,
  plan: null | PortfolioReweightPlan,
): Kept {
  if (plan === null) {
    return merged;
  }
  switch (plan.kind) {
    case "matched":
      return { ...merged, targets: plan.targets };
    case "reweight":
      return { ...merged, targets: plan.reweight.targets };
    case "unsynced":
      return merged;
  }
}

// Copies exact float shares from the stored or rewritten portfolio file
// onto matching merged categories, preserving category order and extra
// 0% categories.
function alignTargets(
  targets: Targets,
  shares: ReadonlyMap<string, number>,
): Targets {
  return {
    ...targets,
    categories: targets.categories.map((category) => ({
      ...category,
      share: shares.get(category.id) ?? category.share,
    })),
  };
}

// Closes the scenario named where it is the one the request has open.
async function closeIfOpen(name: string): Promise<void> {
  if ((await openedScenario()) === name) {
    await closeScenario();
  }
}

// Why a decision is refused as stale, where the household or the
// scenario has moved from the version the page deciding it was drawn
// from, or null where neither has.
function movedSince(
  shown: Shown,
  household: number,
  scenario: number,
): null | string {
  if (scenario !== shown.scenario) {
    return "The scenario changed while this was being decided, so nothing was";
  }
  return household === shown.household
    ? null
    : "The household changed while this was being decided, so nothing was";
}

// Persists a prepared .portfolio reweight after the household commit,
// retrying once against the latest stored file if a concurrent edit
// landed first. Leaves the adoption standing on any remaining failure
// and logs unexpected non-Refusal errors.
async function persistPortfolioReweight(
  db: Database,
  reweight: PortfolioReweight,
): Promise<boolean> {
  const write = async (
    next: PortfolioReweight,
    canRetry: boolean,
  ): Promise<boolean> => {
    try {
      await keepPortfolioAfter(db, next.afterVersion, {
        content: next.content,
        fileName: next.fileName,
      });
      return true;
    } catch (error: unknown) {
      if (error instanceof Stale && canRetry) {
        const latestStored = await readLatestPortfolio(db);
        if (latestStored === null) {
          return false;
        }
        const retried = preparePortfolioReweight(latestStored, next.targets);
        switch (retried.kind) {
          case "matched":
            return true;
          case "reweight":
            return write(retried.reweight, false);
          case "unsynced":
            return false;
        }
      }
      throw error;
    }
  };
  try {
    return await write(reweight, true);
  } catch (error: unknown) {
    if (!(error instanceof Refusal)) {
      console.error(portfolioUnsynced, error);
    }
    return false;
  }
}

// Classifies how the stored .portfolio file relates to the merged
// scenario targets: already matching within shareTolerance (copying
// exact stored floats so strict target equality holds), ready to
// reweight in place (aligning merged categories to the rounded weights
// written back), or unsynced when the file cannot be read, a
// positive-share category is absent, or rewriting fails size or
// round-trip checks.
function preparePortfolioReweight(
  stored: StoredPortfolio,
  mergedTargets: Targets,
): PortfolioReweightPlan {
  const storedTargets = answerOf(() => readTargets(stored.content));
  if (storedTargets.kind === "refused") {
    return { kind: "unsynced" };
  }
  const storedShares = new Map(
    storedTargets.value.map(({ id, share }) => [id, share]),
  );
  if (
    mergedTargets.categories.some(
      ({ id, share }) => share > 0 && !storedShares.has(id),
    )
  ) {
    return { kind: "unsynced" };
  }
  const shares = new Map(
    mergedTargets.categories.map(({ id, share }) => [id, share]),
  );
  const hasShareDiff = storedTargets.value.some(
    ({ id, share }) => Math.abs(share - (shares.get(id) ?? 0)) > shareTolerance,
  );
  if (!hasShareDiff) {
    return {
      kind: "matched",
      targets: alignTargets(mergedTargets, storedShares),
    };
  }
  const rewritten = answerOf(() => {
    const content = reweighted(stored.content, shares);
    if (content.byteLength > maxPortfolioBytes) {
      throw new Refusal(portfolioTooLarge);
    }
    readPortfolioSnapshot(content, stored.fileName);
    return { content, targets: readTargets(content) };
  });
  if (rewritten.kind === "refused") {
    return { kind: "unsynced" };
  }
  const roundedShares = new Map(
    rewritten.value.targets.map(({ id, share }) => [id, share]),
  );
  return {
    kind: "reweight",
    reweight: {
      afterVersion: stored.version,
      content: rewritten.value.content,
      fileName: stored.fileName,
      targets: alignTargets(mergedTargets, roundedShares),
    },
  };
}

// Completes any secondary .portfolio write required by the reweight
// plan after the household adoption itself has committed.
async function syncForPlan(
  db: Database,
  plan: null | PortfolioReweightPlan,
): Promise<boolean> {
  if (plan === null) {
    return true;
  }
  switch (plan.kind) {
    case "matched":
      return true;
    case "reweight":
      return persistPortfolioReweight(db, plan.reweight);
    case "unsynced":
      return false;
  }
}
