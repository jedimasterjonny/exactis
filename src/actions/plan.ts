"use server";

import * as z from "zod";

import type { Deductions } from "@/data/cma";
import type { Drawdown, PlanAges } from "@/data/plan";
import type { Allocation, Anchor, Rates, RateSet } from "@/data/rates";
import type { Answer } from "@/lib/answer";

import { atAge } from "@/data/milestones";
import { ageIn, drawdowns, oldestAge } from "@/data/plan";
import { rateSets } from "@/data/rates";
import { Refusal } from "@/lib/answer";
import { today } from "@/lib/months";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// What a save may carry: either age or both, each whole and neither
// below nothing, and whichever is not sent is kept as the household has
// it, so the dashboard can move the retirement age without knowing the
// end age, and the other way.
const patch = z.object({
  ends: z.number().int().nonnegative().optional(),
  retires: z.number().int().nonnegative().optional(),
});

// What a save of the rates may carry: any of them, each a number, and
// whichever is not sent is kept as the household has it, so the
// assumptions screen can save the one it holds as each is typed. A rate
// sent as nothing at all is refused rather than read as not sent.
const ratesPatch = z.object({
  bonds: z.number().exactOptional(),
  dividends: z.number().exactOptional(),
  inflation: z.number().exactOptional(),
  stocks: z.number().exactOptional(),
});

// What a save of the deductions may carry: either, each a number, and
// whichever is not sent is kept as the household has it, as with the
// rates; neither, to confirm them still right as they are.
const deductionsPatch = z.object({
  dividends: z.number().exactOptional(),
  fees: z.number().exactOptional(),
});

// What a save of the split carries: the share in stocks.
const split = z.object({ stocks: z.number() });

// What a save of an anchor of the glide path carries: an age, and the
// share in bonds at it.
const anchor = z.object({ age: z.number(), bonds: z.number() });

// Deletes the anchor of the glide path at the age given, and hands
// back nothing. An action answers a POST from anywhere, so it checks the
// session for itself and parses what it was sent rather than trusting
// the form. An age no anchor is at is refused, since the anchor it named
// has gone since the screen was drawn, and so is a path left that the
// plan cannot run on under the rates live; a refusal is in the rule's
// words, since the screen says so under a toast.
export async function removeAnchor(age: number): Promise<Answer<undefined>> {
  await requireSession();
  const at = z.number().parse(age);
  return amend(({ kept }) => ({
    kept: { ...kept, glide: othersThan(kept.glide, at) },
    result: undefined,
  }));
}

// Writes the plan's ages, the ones sent over the ones the household
// has, and hands back the ages as it now has them: the end age with the
// plan, and the retirement age on the first listed owner, whose plan it
// is, as their retirement's one condition, so the dashboard moves their
// retirement and nobody else's, and an end age saved alone leaves what
// they retire on as it was. An
// action answers a POST from anywhere, so it checks the session for
// itself and parses what it was sent rather than trusting the form. An
// end age sent is held to a plan that runs: past the age its owner has
// already reached, so it has a year to project, and no later than the
// oldest age a plan may run to. One kept as the household has it is not
// held there again, so an end age the owner has since outlived does not
// refuse a retirement age saved beside it. Whichever is sent, the
// household holds the owner to retiring no later than the plan ends,
// since the chart can mark a retirement only within the plan. A
// retirement already past is sound, since it says only that nothing is
// earned by working. Each refusal says why, since the screen says so
// under a toast.
export async function saveAges(
  draft: Partial<PlanAges>,
): Promise<Answer<PlanAges>> {
  await requireSession();
  const parsed = patch.parse(draft);
  return amend(({ household, kept }) => {
    const { plan } = household;
    if (
      parsed.ends !== undefined &&
      (parsed.ends <= ageIn(plan.from, plan) || parsed.ends > oldestAge)
    ) {
      throw new Refusal(
        `A plan ends after the age already reached and by ${String(oldestAge)}`,
      );
    }
    const ages = {
      ends: parsed.ends ?? kept.ages.ends,
      retires: parsed.retires ?? plan.retires,
    };
    return {
      kept: {
        ...kept,
        ages: { ends: ages.ends },
        owners: kept.owners.map((owner, index) =>
          index === 0 && parsed.retires !== undefined
            ? { ...owner, retirement: atAge(parsed.retires) }
            : owner,
        ),
      },
      result: ages,
    };
  });
}

// Writes how the savings are split, and hands it back as written. An
// action answers a POST from anywhere, so it checks the session for
// itself and parses what it was sent rather than trusting the form. The
// share is held to none of the savings, all of them or a share by the
// household, and so is the plan rate the split makes, as a debt charged
// it must still be paid off at it; a refusal is in the rule's words,
// since the screen says so under a toast.
export async function saveAllocation(
  draft: Allocation,
): Promise<Answer<Allocation>> {
  await requireSession();
  const allocation = split.parse(draft);
  return amend(({ kept }) => ({
    kept: { ...kept, allocation },
    result: allocation,
  }));
}

// Writes an anchor of the glide path, in place of the one at the age it
// was saved at, which an edit can move it from, or beside the rest for a
// new one, the path kept youngest first, and hands it back as written.
// The anchor is sent alone and laid over the path as the store holds
// it, so an anchor added or changed on another tab since this screen was
// drawn is kept rather than written over. An action answers a POST from
// anywhere, so it checks the session for itself and parses what it was
// sent rather than trusting the form. An age saved at that no anchor is
// at is refused, since the anchor it named has gone since; and each
// anchor is held to its rules by the household, an age to one anchor
// among them, and so is the plan the path makes, under the rates live;
// a refusal is in the rule's words, since the screen says so under a
// toast.
export async function saveAnchor(
  savedAt: null | number,
  draft: Anchor,
): Promise<Answer<Anchor>> {
  await requireSession();
  const at = z.number().nullable().parse(savedAt);
  const written = anchor.parse(draft);
  return amend(({ kept }) => ({
    kept: {
      ...kept,
      glide: [...othersThan(kept.glide, at), written].toSorted(
        (first, second) => first.age - second.age,
      ),
    },
    result: written,
  }));
}

// Writes what comes off the CMA's returns to derive the rates, the
// deductions sent over the ones the household has, dated today, and
// hands back the deductions as it now has them. Sent neither, it keeps
// both and dates them today, which is how they are confirmed still
// right. An action answers a POST from
// anywhere, so it checks the session for itself and parses what it was
// sent rather than trusting the form. Each is held to its rule by the
// household, and, while the plan runs on the CMA's rates, so are the
// rates they make and the plan those make; a refusal is in the rule's
// words, since the screen says so under a toast.
export async function saveDeductions(
  draft: Partial<Deductions>,
): Promise<Answer<Deductions>> {
  await requireSession();
  const parsed = deductionsPatch.parse(draft);
  return amend(({ kept }) => {
    const deductions = { ...kept.deductions, ...parsed, setOn: today() };
    return { kept: { ...kept, deductions }, result: deductions };
  });
}

// Writes the order a month's shortfall is drawn in, and hands it back
// as written. An action answers a POST from anywhere, so it checks the
// session for itself and parses what it was sent rather than trusting
// the form; a name the dialog does not offer fails there, as only a bug
// or a forgery could send one.
export async function saveDrawdown(draft: Drawdown): Promise<Answer<Drawdown>> {
  await requireSession();
  const drawdown = z.enum(drawdowns).parse(draft);
  return amend(({ kept }) => ({
    kept: { ...kept, drawdown },
    result: drawdown,
  }));
}

// Writes the plan's rates, the ones sent over the ones the household
// has, and hands back the rates as it now has them. An action answers a
// POST from anywhere, so it checks the session for itself and parses
// what it was sent rather than trusting the form. Each rate is held to
// its rule by the household, and so is the plan the rates make, as a
// debt charged the plan rate must still be paid off at it; a refusal is
// in the rule's words, since the screen says so under a toast.
export async function saveRates(draft: Partial<Rates>): Promise<Answer<Rates>> {
  await requireSession();
  const parsed = ratesPatch.parse(draft);
  return amend(({ kept }) => {
    const rates = { ...kept.rates, ...parsed };
    return { kept: { ...kept, rates }, result: rates };
  });
}

// Writes which set of rates the plan runs on, and hands it back as
// written. An action answers a POST from anywhere, so it checks the
// session for itself and parses what it was sent rather than trusting
// the form. The CMA's are chosen only while the CMA gives some, and the
// household refuses them otherwise saying what is missing, as it holds
// the plan they make to every rule; the rates typed are always there to
// choose.
export async function saveRateSet(set: RateSet): Promise<Answer<RateSet>> {
  await requireSession();
  const rateSet = z.enum(rateSets).parse(set);
  return amend(({ kept }) => ({ kept: { ...kept, rateSet }, result: rateSet }));
}

// The glide path without the anchor at the age given, or as it is given
// none. An age no anchor is at is refused, since the anchor a screen
// named by it has gone since the screen was drawn.
function othersThan(glide: readonly Anchor[], at: null | number): Anchor[] {
  if (at !== null && !glide.some(({ age }) => age === at)) {
    throw new Refusal("No anchor is at that age");
  }
  return glide.filter(({ age }) => age !== at);
}
