"use server";

import { updateTag } from "next/cache";
import * as z from "zod";

import type { Owner, OwnerValues } from "@/data/owners";

import { isOwning } from "@/db/accounts";
import { getDb } from "@/db/client";
import { deleteOwner, insertOwner, updateOwner } from "@/db/owners";
import { requireSession } from "@/lib/session";
import { ownersTag } from "@/store/owners";

// What a save may carry: the name as typed less the space around it,
// which the form also trims, and never empty.
const values = z.object({
  name: z.string().trim().min(1),
}) satisfies z.ZodType<OwnerValues>;

const target = z.number().int().positive().nullable();

// Deletes the owner with that id, unless an account names it: an ISA or
// a pension belongs to an owner, and the store refuses to leave it
// belonging to none, so the account is given to another owner or
// deleted first, and the refusal says so rather than surfacing as the
// store's broken link. Checked and expired as a save is.
export async function removeOwner(id: number): Promise<void> {
  await requireSession();
  const at = z.number().int().positive().parse(id);
  const db = getDb();
  if (await isOwning(db, at)) {
    throw new Error("An owner who holds an account stays");
  }
  await deleteOwner(db, at);
  updateTag(ownersTag);
}

// Writes an owner: a new one when the id is null, else over the one with
// that id, and hands back the owner as the store now has it. An action
// answers a POST from anywhere, so it checks the session for itself and
// parses what it was sent rather than trusting the form, and the tag is
// expired before returning, so the same round trip carries the list
// re-read.
export async function saveOwner(
  id: null | number,
  draft: OwnerValues,
): Promise<Owner> {
  await requireSession();
  const at = target.parse(id);
  const parsed = values.parse(draft);
  const db = getDb();
  const saved =
    at === null
      ? await insertOwner(db, parsed)
      : await updateOwner(db, at, parsed);
  updateTag(ownersTag);
  return saved;
}
