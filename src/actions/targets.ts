"use server";

import * as z from "zod";

import type { Mapping } from "@/data/cma";
import type { Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { suggestedMappings } from "@/data/class-table";
import { holdWhileLive } from "@/data/household";
import { effectiveSyncedOn } from "@/data/portfolio";
import { named, scenarioName } from "@/data/schemas";
import { getDb } from "@/db/client";
import { readLatestPortfolio } from "@/db/portfolio";
import { Refusal } from "@/lib/answer";
import { dayOf } from "@/lib/months";
import { readPortfolioTargets } from "@/lib/portfolio-file";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// The branch a target sync names as the one its page was drawn on, the
// household as null or a scenario by name, or none to sync whichever
// branch is open.
const branch = scenarioName.nullable().optional();

// What a mapping carries: the category by its id, and the asset class
// it is mapped onto by its name, or none, to map it onto none.
const mapped = z.object({ asset: named.nullable(), category: z.string() });

// Maps every category of the target allocation the latest CMA cannot
// blend, with no class or one it does not price, onto the class its name
// suggests, and hands back what it mapped. A category on a class the CMA
// prices is left as it was chosen, so nothing chosen by hand is written
// over. An action answers a POST from anywhere, so it checks the session
// for itself. Mapping by name before a CMA is pulled and a target
// allocation imported is refused, as is mapping when no category without
// a class has one suggested, since the screen offers it only when there
// is something to map.
export async function mapByName(): Promise<Answer<readonly Mapping[]>> {
  await requireSession();
  return amend(({ kept }) => {
    if (kept.cma === null || kept.targets === null) {
      throw new Refusal(
        "Categories are mapped by name once a CMA is pulled and a target allocation synced",
      );
    }
    const suggested = suggestedMappings(
      kept.cma.latest,
      kept.targets,
      kept.mappings,
    );
    if (suggested.length === 0) {
      throw new Refusal("No category without a class has one suggested");
    }
    const mappings = [
      ...kept.mappings.filter(
        ({ category }) => !suggested.some((each) => each.category === category),
      ),
      ...suggested,
    ];
    return { kept: { ...kept, mappings }, result: suggested };
  });
}

// Maps a category of the target allocation onto an asset class the
// latest CMA prices, over whatever class it was mapped onto, or onto
// none, and hands back every category's mapping as kept. An action
// answers a POST from anywhere, so it checks the session for itself and
// parses what it was sent rather than trusting the screen. A category
// the target allocation does not list is refused, and so is a class the
// latest CMA does not price, or any class before a CMA is pulled, since
// the screen offers only those. Mapping onto none is never refused, so a
// mapping the CMA has stopped pricing can still be taken off.
export async function mapCategory(draft: {
  readonly asset: null | string;
  readonly category: string;
}): Promise<Answer<readonly Mapping[]>> {
  await requireSession();
  const { asset, category } = mapped.parse(draft);
  return amend(({ kept }) => {
    const listed = kept.targets?.categories ?? [];
    if (!listed.some(({ id }) => id === category)) {
      throw new Refusal("A category is mapped once it is synced");
    }
    const priced = kept.cma?.latest.assets ?? [];
    if (asset !== null && !priced.some(({ name }) => name === asset)) {
      throw new Refusal(`The latest CMA prices no ${asset}`);
    }
    const others = kept.mappings.filter(
      (mapping) => mapping.category !== category,
    );
    const mappings = asset === null ? others : [...others, { asset, category }];
    return { kept: { ...kept, mappings }, result: mappings };
  });
}

// Syncs the open branch's target allocation from the household's stored
// .portfolio file, stamping importedOn from the file's latest quote or
// transaction date (falling back to its UK save date) without modifying
// portfolio_files. When a branch is named, refuses if another branch
// was opened since the screen was drawn. Refuses before a file is
// uploaded, when the file's targets cannot be read, or when syncing
// would leave live CMA rates without a blend.
export async function syncTargetsFromPortfolio(
  on?: null | string,
): Promise<Answer<Targets>> {
  await requireSession();
  const drawnOn = branch.parse(on);
  return amend(async ({ kept }) => {
    const stored = await readLatestPortfolio(getDb());
    if (stored === null) {
      throw new Refusal("Upload a portfolio file before syncing");
    }
    const {
      categories: readCategories,
      latestQuoteDate,
      latestTransactionDate,
      portfolios: readPortfolios,
    } = readPortfolioTargets(stored.content);
    const targets: Targets = {
      categories: readCategories,
      importedOn: effectiveSyncedOn({
        latestQuoteDate,
        latestTransactionDate,
        savedOn: dayOf(stored.savedAt),
      }),
      portfolios: readPortfolios,
    };
    const next = { ...kept, targets };
    holdWhileLive(next, {
      cannot: "this allocation cannot be synced",
      then: "sync it and give its new categories a class",
    });
    return { kept: next, result: targets };
  }, drawnOn);
}
