"use server";

import * as z from "zod";

import type { Deductions } from "@/data/cma";
import type { PlanAges } from "@/data/plan";
import type { Allocation, Rates, RateSet } from "@/data/rates";
import type { Answer } from "@/lib/answer";

import { ageIn, oldestAge } from "@/data/plan";
import { rateSets } from "@/data/rates";
import { Refusal } from "@/lib/answer";
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
// rates.
const deductionsPatch = z.object({
  dividends: z.number().exactOptional(),
  fees: z.number().exactOptional(),
});

// What a save of the split carries: the share in stocks.
const split = z.object({ stocks: z.number() });

// Writes the plan's ages, the ones sent over the ones the household
// has, and hands back the ages as it now has them. An action answers a
// POST from anywhere, so it checks the session for itself and parses
// what it was sent rather than trusting the form. An end age sent is
// held to a plan that runs: past the age its owner has already reached,
// so it has a year to project, and no later than the oldest age a plan
// may run to. One kept as the household has it is not held there again,
// so an end age the owner has since outlived does not refuse a
// retirement age saved beside it. Whichever is sent, the household
// holds the owner to retiring no later than the plan ends, since the
// chart can mark a retirement only within the plan. A retirement
// already past is sound, since it says only that nothing is earned by
// working. Each refusal says why, since the screen says so under a
// toast.
export async function saveAges(
  draft: Partial<PlanAges>,
): Promise<Answer<PlanAges>> {
  await requireSession();
  const parsed = patch.parse(draft);
  return amend(({ household, kept }) => {
    if (parsed.ends !== undefined) {
      const { plan } = household;
      if (parsed.ends <= ageIn(plan.from, plan) || parsed.ends > oldestAge) {
        throw new Refusal(
          `A plan ends after the age already reached and by ${String(oldestAge)}`,
        );
      }
    }
    const ages = {
      ends: parsed.ends ?? kept.ages.ends,
      retires: parsed.retires ?? kept.ages.retires,
    };
    return { kept: { ...kept, ages }, result: ages };
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

// Writes what comes off the CMA's returns to derive the rates, the
// deductions sent over the ones the household has, and hands back the
// deductions as it now has them. An action answers a POST from
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
    const deductions = { ...kept.deductions, ...parsed };
    return { kept: { ...kept, deductions }, result: deductions };
  });
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
