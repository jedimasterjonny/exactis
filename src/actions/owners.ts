"use server";

import * as z from "zod";

import type { Owner, OwnerValues } from "@/data/owners";
import type { Answer } from "@/lib/answer";

import { named, recordId, target } from "@/data/schemas";
import { Refusal } from "@/lib/answer";
import { removed, written } from "@/lib/records";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// What a save may carry: the name as typed less the space around it,
// which the form also trims, and never empty.
const values = z.object({ name: named }) satisfies z.ZodType<OwnerValues>;

// Deletes the owner with that id, unless an account names it: an ISA or
// a pension belongs to an owner, and the household refuses to leave it
// belonging to none, so the account is given to another owner or
// deleted first, and the refusal says so in words that say what to do.
// Checked as a save is.
export async function removeOwner(id: number): Promise<Answer<undefined>> {
  await requireSession();
  const at = recordId.parse(id);
  return amend(({ kept }) => {
    const owners = removed(kept.owners, at, "owner");
    if (kept.accounts.some(({ owner }) => owner === at)) {
      throw new Refusal("An owner who holds an account stays");
    }
    return { kept: { ...kept, owners }, result: undefined };
  });
}

// Writes an owner: a new one when the id is null, given the household's
// next id, else over the one with that id, and hands back the owner as
// the household now has it. An action answers a POST from anywhere, so
// it checks the session for itself and parses what it was sent rather
// than trusting the form.
export async function saveOwner(
  id: null | number,
  draft: OwnerValues,
): Promise<Answer<Owner>> {
  await requireSession();
  const at = target.parse(id);
  const parsed = values.parse(draft);
  return amend(({ kept }) => {
    const {
      next,
      records,
      written: owner,
    } = written(kept.owners, { at, next: kept.next, noun: "owner" }, (id) => ({
      ...parsed,
      id,
    }));
    return { kept: { ...kept, next, owners: records }, result: owner };
  });
}
