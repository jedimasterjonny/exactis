"use server";

import * as z from "zod";

import type { Mapping } from "@/data/cma";
import type { Target, Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

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
// toast.
export async function importTargets(
  read: readonly Target[],
): Promise<Answer<Targets>> {
  await requireSession();
  const parsed = categories.parse(read);
  return amend(({ kept }) => {
    const targets = { categories: parsed, importedOn: today() };
    return { kept: { ...kept, targets }, result: targets };
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
