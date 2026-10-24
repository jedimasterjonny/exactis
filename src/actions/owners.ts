"use server";

import * as z from "zod";

import type { Owner, OwnerValues } from "@/data/owners";
import type { Answer } from "@/lib/answer";

import { withRecord } from "@/data/owners";
import { ownerValues, recordId, target } from "@/data/schemas";
import { Refusal } from "@/lib/answer";
import { thisMonth } from "@/lib/months";
import {
  found,
  holdUnchanged,
  removed,
  replaced,
  written,
} from "@/lib/records";
import { requireSession } from "@/lib/session";
import { taxYearOf } from "@/lib/tax";
import { amend } from "@/store/household";

// What a save may carry: the name as typed less the space around it,
// which the form also trims, and never empty, the year born and the
// retirement, each as the model holds them. The qualifying years and the
// tax year they run through are not among them, since the dialog does
// not hold them: they are typed on the assumptions screen and written
// together by saveQualifyingYears, and a save here keeps them as they
// are.
const values = z
  .object(ownerValues)
  .omit({
    qualifiedThrough: true,
    qualifyingYears: true,
  }) satisfies z.ZodType<OwnerValues>;

// An owner as the dialog opened on it, as the household parses its
// owners, less the qualifying years and their tax year, which are saved
// on their own, so an edit of them elsewhere is no change to what the
// dialog holds. The owner held now is parsed the same way, so the two
// compare key for key.
const opening = values.extend({ id: recordId });

// Deletes the owner with that id, unless an account or an income line
// names it: an ISA or a pension belongs to an owner, and an income line
// is earned by one, and the household refuses to leave either with
// none, so the account or the line is given to another owner or
// deleted first, and the refusal says so in words that say what to do.
// The last owner is refused by the household in its own words, since a
// plan is somebody's, as is the plan's owner while the owner listed next
// retires with them, since the plan would pass to an owner retiring with
// themselves. Checked as a save is.
export async function removeOwner(id: number): Promise<Answer<undefined>> {
  await requireSession();
  const at = recordId.parse(id);
  return amend(({ kept }) => {
    const owners = removed(kept.owners, at, "owner");
    if (kept.accounts.some(({ owner }) => owner === at)) {
      throw new Refusal("An owner who holds an account stays");
    }
    if (kept.schedule.income.some(({ owner }) => owner === at)) {
      throw new Refusal("An owner who earns an income line stays");
    }
    return { kept: { ...kept, owners }, result: undefined };
  });
}

// Writes an owner: a new one when the id is null, given the household's
// next id, else over the one with that id, keeping the qualifying years
// and the tax year it holds, and hands back the owner as the household
// now has it. An action answers a POST from anywhere, so it checks the
// session for itself and parses what it was sent rather than trusting
// the form. The dialog sends the owner as it opened on it beside the
// draft, and an edit of one changed since, as by a retirement age
// dragged on the dashboard meanwhile, is refused rather than written
// back over the change.
export async function saveOwner(
  id: null | number,
  draft: OwnerValues,
  opened: null | Owner,
): Promise<Answer<Owner>> {
  await requireSession();
  const at = target.parse(id);
  const parsed = values.parse(draft);
  const asOpened = opening.nullable().parse(opened);
  return amend(({ kept }) => {
    if (at !== null) {
      holdUnchanged(
        asOpened,
        opening.parse(found(kept.owners, at, "owner")),
        "owner",
      );
    }
    const {
      next,
      records,
      written: owner,
    } = written(
      kept.owners,
      { at, next: kept.next, noun: "owner" },
      (id, listed) => ({ ...listed, ...parsed, id }),
    );
    return { kept: { ...kept, next, owners: records }, result: owner };
  });
}

// Writes the National Insurance record of the owner with that id, the
// years they have qualified for the State Pension on and the tax year
// those run through, by the year it opens in, or none for years taken as
// they stand, and hands back the owner as the household now has it. The
// two are written together, since the tax year dates the years and
// neither is right without the other. Only the record is written, over
// the owner as the store holds it, so a name or a retirement saved on
// another screen since is kept rather than written over. A tax year that
// has not ended, this one among them, is refused, since its year is not
// yet qualified for. An action answers a POST from anywhere, so it checks
// the session for itself and parses what it was sent, as the model holds
// the record, rather than trusting the figures.
export async function saveQualifyingYears(
  id: number,
  years: number,
  through: null | number,
): Promise<Answer<Owner>> {
  await requireSession();
  const at = recordId.parse(id);
  const qualifyingYears = ownerValues.qualifyingYears.parse(years);
  const qualifiedThrough = ownerValues.qualifiedThrough
    .unwrap()
    .nullable()
    .parse(through);
  return amend(({ kept }) => {
    if (
      qualifiedThrough !== null &&
      qualifiedThrough >= taxYearOf(thisMonth())
    ) {
      throw new Refusal(
        "The qualifying years run through a tax year that has ended",
      );
    }
    const owner = withRecord(
      found(kept.owners, at, "owner"),
      qualifyingYears,
      qualifiedThrough,
    );
    return {
      kept: { ...kept, owners: replaced(kept.owners, owner) },
      result: owner,
    };
  });
}
