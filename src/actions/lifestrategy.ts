"use server";

import * as z from "zod";

import type { Household, Kept } from "@/data/household";
import type { Fund, Holdings } from "@/data/lifestrategy";
import type { Allocation } from "@/data/rates";
import type { Answer } from "@/lib/answer";

import { holdWhileLive, nothingKeptIn, soundKept } from "@/data/household";
import {
  range,
  readHoldings,
  requestOf,
  retargeted,
  splitFor,
} from "@/data/lifestrategy";
import { afterVersionSchema, effectiveSyncedOn } from "@/data/portfolio";
import { scenarioName } from "@/data/schemas";
import { upcast } from "@/data/shapes";
import { getDb } from "@/db/client";
import { readLatest } from "@/db/household";
import { readLatestPortfolio } from "@/db/portfolio";
import { answerOf, Refusal, refused } from "@/lib/answer";
import { download } from "@/lib/download";
import { monthBefore, thisMonth, today } from "@/lib/months";
import {
  readPortfolioTargets,
  readTargets,
  reweighted,
} from "@/lib/portfolio-file";
import { requireSession } from "@/lib/session";
import { amend, readHeld } from "@/store/household";
import { amendPortfolio } from "@/store/portfolio";

interface RetargetedAllocation {
  readonly asOf: string;
  readonly isScenarioOnly: boolean;
  readonly savedOn?: string;
  readonly split: Allocation;
  readonly syncWarning?: string;
  readonly version?: number;
}

interface RetargetOptions {
  readonly afterVersion?: number;
  readonly on?: null | string;
}

const retargetOptionsSchema = z
  .object({
    afterVersion: afterVersionSchema.optional(),
    on: scenarioName.nullable().optional(),
  })
  .optional();

// Retargets the open branch's target allocation from what the
// LifeStrategy fund of the id given holds on Vanguard, laid over the
// branch's categories at the plan's split (or the fund's own when the
// plan runs on CMA rates without a glide path or the fund holds no
// bonds). Checks the session, fund id, branch guard, decision status,
// and target readability before contacting Vanguard.
//
// In the household, rewrites the owned .portfolio file's Asset
// Allocation weights in place after afterVersion, re-validating live
// CMA rules against the latest household before committing
// portfolio_files and auto-syncing household.targets.
//
// In a scenario, updates only the scenario's household.targets shares
// (rounding through reweighted in memory when a stored .portfolio file
// contains every positive-share category), leaving portfolio_files,
// importedOn, holdings, cash, and paid history untouched.
export async function retargetFromLifeStrategy(
  portId: string,
  options?: RetargetOptions,
): Promise<Answer<RetargetedAllocation>> {
  await requireSession();
  const fund = range.find((each) => each.portId === portId);
  if (fund === undefined) {
    return refused("No LifeStrategy fund goes by that id");
  }
  const parsed = retargetOptionsSchema.parse(options);
  const afterVersion = parsed?.afterVersion;
  const on = parsed?.on;
  try {
    const branch = await readHeld();
    if (on !== undefined && branch.scenario !== (on ?? "")) {
      return refused(
        "Another branch was opened before this was saved, so nothing was; make the change again",
      );
    }
    if (branch.isDecided) {
      return refused(
        "This scenario is decided, so it takes no edits; make a new scenario from it to change it",
      );
    }
    if (branch.scenario === "") {
      if (afterVersion === undefined) {
        throw new Error("Invalid afterVersion");
      }
      return await retargetHousehold(afterVersion, fund);
    }
    return await retargetScenario({
      fund,
      hasTargets: branch.kept.targets !== null,
      scenario: branch.scenario,
    });
  } catch (error: unknown) {
    if (error instanceof Refusal) {
      return refused(error.message);
    }
    throw error;
  }
}

async function fetchHoldings(fund: Fund): Promise<Holdings> {
  const sent = await download(
    requestOf(fund),
    "Vanguard",
    `what ${fund.name} holds`,
  );
  if (typeof sent === "string") {
    throw new Refusal(sent);
  }
  return readHoldings(sent, fund);
}

// The split the plan enforces on a retarget, or null when CMA rates
// with no glide path let the fund keep its own split.
function planSplitOf(household: Household): Allocation | null {
  return household.rateSet === "cma" && household.glide.length === 0
    ? null
    : household.split;
}

async function retargetHousehold(
  afterVersion: number,
  fund: Fund,
): Promise<Answer<RetargetedAllocation>> {
  return amendPortfolio(afterVersion, async (stored) => {
    const { categories: held } = readPortfolioTargets(stored.content);
    const holdings = await fetchHoldings(fund);
    const latest = await readLatest(getDb(), "");
    const { household: latestHousehold, kept: keptNow } = soundKept(
      latest === null
        ? nothingKeptIn(monthBefore(thisMonth()))
        : upcast(latest.household),
    );
    const planSplit = planSplitOf(latestHousehold);
    const effectiveSplit = splitFor(fund, planSplit);
    const written = reweighted(
      stored.content,
      retargeted(held, holdings, planSplit),
    );
    const { categories, latestQuoteDate, latestTransactionDate, portfolios } =
      readPortfolioTargets(written);
    const syncedOn = effectiveSyncedOn({
      latestQuoteDate,
      latestTransactionDate,
      savedOn: today(),
    });
    const nextHousehold: Kept = {
      ...keptNow,
      targets: { categories, importedOn: syncedOn, portfolios },
    };
    holdWhileLive(nextHousehold, {
      cannot: "this allocation cannot be retargeted",
      then: "retarget it and give its new categories a class",
    });
    soundKept(nextHousehold);
    return {
      content: written,
      result: {
        asOf: holdings.asOf,
        isScenarioOnly: false,
        split: effectiveSplit,
      },
    };
  });
}

async function retargetScenario({
  fund,
  hasTargets,
  scenario,
}: {
  readonly fund: Fund;
  readonly hasTargets: boolean;
  readonly scenario: string;
}): Promise<Answer<RetargetedAllocation>> {
  if (!hasTargets) {
    return refused("Sync from Portfolio before retargeting");
  }
  const holdings = await fetchHoldings(fund);
  return amend(async ({ household, kept }) => {
    if (kept.targets === null) {
      throw new Refusal("Sync from Portfolio before retargeting");
    }
    const planSplit = planSplitOf(household);
    const effectiveSplit = splitFor(fund, planSplit);
    const shares = retargeted(kept.targets.categories, holdings, planSplit);
    const stored = await readLatestPortfolio(getDb());
    const applied = roundedSharesOf(shares, stored?.content ?? null);
    const next: Kept = {
      ...kept,
      targets: {
        ...kept.targets,
        categories: kept.targets.categories.map((category) => ({
          ...category,
          share: applied.get(category.id) ?? 0,
        })),
      },
    };
    holdWhileLive(next, {
      cannot: "this allocation cannot be retargeted",
      then: "retarget it and give its new categories a class",
    });
    return {
      kept: next,
      result: {
        asOf: holdings.asOf,
        isScenarioOnly: true,
        split: effectiveSplit,
      },
    };
  }, scenario);
}

function roundedSharesOf(
  shares: ReadonlyMap<string, number>,
  stored: null | Uint8Array,
): ReadonlyMap<string, number> {
  if (stored === null) {
    return shares;
  }
  const storedTargets = answerOf(() => readTargets(stored));
  if (storedTargets.kind === "refused") {
    return shares;
  }
  const storedIds = new Set(storedTargets.value.map(({ id }) => id));
  if ([...shares].some(([id, share]) => share > 0 && !storedIds.has(id))) {
    return shares;
  }
  return new Map(
    readTargets(reweighted(stored, shares)).map(({ id, share }) => [id, share]),
  );
}
