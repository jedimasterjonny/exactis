"use server";

import * as z from "zod";

import type { Owner, OwnerValues } from "@/data/owners";

import { found, replaced } from "@/lib/records";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// What a save may carry: the name as typed less the space around it,
// which the form also trims, and never empty.
const values = z.object({
  name: z.string().trim().min(1),
}) satisfies z.ZodType<OwnerValues>;

const target = z.number().int().positive().nullable();

// Deletes the owner with that id, unless an account names it: an ISA or
// a pension belongs to an owner, and the household refuses to leave it
// belonging to none, so the account is given to another owner or
// deleted first, and the refusal says so in words that say what to do.
// Checked as a save is.
export async function removeOwner(id: number): Promise<void> {
  await requireSession();
  const at = z.number().int().positive().parse(id);
  await amend(({ kept }) => {
    found(kept.owners, at, "owner");
    if (kept.accounts.some(({ owner }) => owner === at)) {
      throw new Error("An owner who holds an account stays");
    }
    return {
      kept: { ...kept, owners: kept.owners.filter(({ id }) => id !== at) },
      result: undefined,
    };
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
): Promise<Owner> {
  await requireSession();
  const at = target.parse(id);
  const parsed = values.parse(draft);
  return amend(({ kept }) => {
    if (at === null) {
      const owner = { ...parsed, id: kept.next };
      return {
        kept: { ...kept, next: kept.next + 1, owners: [...kept.owners, owner] },
        result: owner,
      };
    }
    found(kept.owners, at, "owner");
    const owner = { ...parsed, id: at };
    return {
      kept: { ...kept, owners: replaced(kept.owners, owner) },
      result: owner,
    };
  });
}
