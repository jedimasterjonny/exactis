"use server";

import { updateTag } from "next/cache";
import * as z from "zod";

import type { Account, AccountValues } from "@/data/accounts";

import { accountKinds, cadences, growthKinds } from "@/data/accounts";
import { insertAccount, updateAccount } from "@/db/accounts";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/session";

import { accountsTag } from "./store";

// What a save may carry, checked against the model's own lists so the
// two cannot drift: the figures whole, a contribution never negative, and
// the name as typed less the space around it, which the form also trims.
const values = z.object({
  balance: z.number().int(),
  cadence: z.enum(cadences),
  contribution: z.number().int().nonnegative(),
  growth: z.enum(growthKinds),
  kind: z.enum(accountKinds),
  name: z.string().trim().min(1),
  rate: z.number(),
}) satisfies z.ZodType<AccountValues>;

const target = z.number().int().positive().nullable();

// Writes an account: a new one when the id is null, else over the one
// with that id, and hands back the account as the store now has it. An
// action answers a POST from anywhere, so it checks the session for
// itself and parses what it was sent rather than trusting the form; a
// value the form could not have sent fails loudly. The tag is expired
// before returning, so the same round trip carries the list re-read.
export async function saveAccount(
  id: null | number,
  draft: AccountValues,
): Promise<Account> {
  await requireSession();
  const at = target.parse(id);
  const parsed = values.parse(draft);
  const db = getDb();
  const account =
    at === null
      ? await insertAccount(db, parsed)
      : await updateAccount(db, at, parsed);
  updateTag(accountsTag);
  return account;
}
