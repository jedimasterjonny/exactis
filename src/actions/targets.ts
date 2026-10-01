"use server";

import * as z from "zod";

import type { Mapping } from "@/data/cma";
import type { Target, Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { suggestedMappings } from "@/data/class-table";
import { holdWhileLive } from "@/data/household";
import { categoryValues, named } from "@/data/schemas";
import { Refusal } from "@/lib/answer";
import { today } from "@/lib/months";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// What an import carries: the categories as the reader read them out of
// the file, each as the model holds one.
const categories = z.array(z.object(categoryValues)) satisfies z.ZodType<
  readonly Target[]
>;

// What a mapping carries: the category by its id, and the asset class
// it is mapped onto by its name, or none, to map it onto none.
const mapped = z.object({ asset: named.nullable(), category: z.string() });

// Keeps the target allocation read out of a Portfolio Performance file
// over whatever the household held, as imported today, and hands it
// back as kept. The file is read in the browser, so only the categories
// are sent, never the holdings and transactions the file holds beside
// them. An action answers a POST from anywhere, so it checks the
// session for itself and parses what it was sent rather than trusting
// the reader that sent it. The categories are held by the household to
// shares of the whole that add up to it, each listed once, and a
// refusal is in the rule's words, since the screen says so under a
// toast. An allocation the CMA's rates, while live, cannot be derived
// from, as one adding a category with no class is, is refused saying how
// it can be imported, under the rates typed.
export async function importTargets(
  read: readonly Target[],
): Promise<Answer<Targets>> {
  await requireSession();
  const parsed = categories.parse(read);
  return amend(({ kept }) => {
    const targets = { categories: parsed, importedOn: today() };
    const next = { ...kept, targets };
    holdWhileLive(next, {
      cannot: "this allocation cannot be imported",
      then: "import it and give its new categories a class",
    });
    return { kept: next, result: targets };
  });
}

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
        "Categories are mapped by name once a CMA is pulled and a target allocation imported",
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
      throw new Refusal("A category is mapped once it is imported");
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
