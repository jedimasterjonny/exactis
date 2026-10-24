import * as z from "zod";

import type { Kept } from "@/data/household";

import { Refusal, refusalOf } from "@/lib/answer";

// One step of the chain: a household kept in one shape, as the shape
// after it.
type Step = (document: Record<string, unknown>) => Record<string, unknown>;

// The steps from each shape to the next, in order, the first taking a
// household kept in the first shape to the second, so there is one fewer
// than there are shapes. A change to the model a household kept before
// it cannot be read under is a step appended here, which counts the
// shape up by itself. The changes made before the first shape were
// carried by rewriting the store rather than by steps. A step carries
// what it finds and leaves what it does not, refusing with a Refusal
// rather than throwing anything else, since an older version is read
// through the chain for its sources alone, before the rules, and a
// refusal reads as no sources there where anything else thrown fails
// the page.
//
// 1 to 2: a pension was dropped in a month short of it unless it was
// marked always funded, and is now kept paid unless it is marked
// droppable. The old mark comes off every account and nothing is marked
// droppable, since the old default was the wrong way round: every
// pension is kept paid until its owner marks the ones to drop.
//
// 2 to 3: a household may list children, and a milestone reached at an
// age may name whose age it is. One kept in the second shape lists none
// and names nobody, so the step carries it as it is. It is taken so
// that a build of the second shape refuses a household of the third
// rather than reading it with its children dropped and every age read
// as the plan's owner's, as it drops any key it does not hold, so a
// child's milestone falls in a year of the owner's, and saving it back
// that way.
const steps: readonly Step[] = [
  (document): Record<string, unknown> => {
    const { accounts } = document;
    return Array.isArray(accounts)
      ? { ...document, accounts: accounts.map(unmarked) }
      : document;
  },
  (document): Record<string, unknown> => document,
];

// The shape a household is kept in now, which every save stamps on it:
// the one the last step reaches. A household kept before shapes were
// numbered carries no stamp and is in the first, so nothing kept then
// has to be written again to be read.
export const currentShape = steps.length + 1;

// A household as the store keeps it, read for the shape it is in, and
// nothing else, so every other key passes through to the household's own
// rules: a stamp missing is the first shape, and one present is a whole
// number from it.
const envelope = z.looseObject({
  shape: z.number().int().positive().default(1),
});

// The household as a save writes it: stamped with the shape it is kept
// in. This is the one place the stamp is written, so nothing writes a
// household in a shape it does not say.
export function stamped(kept: Kept): Kept & { readonly shape: number } {
  return { ...kept, shape: currentShape };
}

// A value kept as a household, carried from the shape it was kept in to
// this app's, with the stamp taken off, for the household's own rules to
// read: what a stored version or a file goes through where it comes in,
// before those rules are held to it, and nothing else does, since a
// household the app makes in memory carries no stamp and would read as
// the first shape, running every step again. A value that is no object
// passes through as it is, for those rules to refuse in their own words.
// A shape the steps do not reach is refused, since a newer app kept it
// and it may hold what this one cannot read, and so is a stamp that is
// no shape. The steps are this app's unless others are handed in, which
// only a test of the chain does, so the shape they reach is counted from
// the steps given rather than read from currentShape.
export function upcast(value: unknown, from: readonly Step[] = steps): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  const parsed = envelope.safeParse(value);
  if (!parsed.success) {
    throw refusalOf(parsed.error);
  }
  const { shape, ...document } = parsed.data;
  if (shape > from.length + 1) {
    throw new Refusal("This household was saved by a newer app than this one");
  }
  return from.slice(shape - 1).reduce((older, step) => step(older), document);
}

// An account kept in the first shape with the mark of a pension always
// funded taken off, and anything else as it was found.
function unmarked(account: unknown): unknown {
  return typeof account === "object" &&
    account !== null &&
    "isAlwaysFunded" in account
    ? Object.fromEntries(
        Object.entries(account).filter(([key]) => key !== "isAlwaysFunded"),
      )
    : account;
}
