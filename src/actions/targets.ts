"use server";

import * as z from "zod";

import type { Target, Targets } from "@/data/targets";
import type { Answer } from "@/lib/answer";

import { categoryValues } from "@/data/schemas";
import { today } from "@/lib/months";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// What an import carries: the categories as the reader read them out of
// the file, each as the model holds one.
const categories = z.array(z.object(categoryValues)) satisfies z.ZodType<
  readonly Target[]
>;

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
