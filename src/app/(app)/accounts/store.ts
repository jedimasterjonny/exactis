import "server-only";
import { cacheLife, cacheTag } from "next/cache";

import type { Account } from "@/data/accounts";

import { listAccounts } from "@/db/accounts";
import { getDb } from "@/db/client";
import { requireSession } from "@/lib/session";

// The tag every read of the accounts carries and every write expires, so
// a save is seen on the way back from it rather than when the cache next
// turns over.
export const accountsTag = "accounts";

// The accounts, for whoever is signed in. The session is read out here,
// since a cached scope cannot read the request, and the read behind it is
// cached and tagged, so a navigation back finds the list ready. The read
// stays unexported so nothing reaches the store without the session read
// in front of it.
export async function getAccounts(): Promise<Account[]> {
  await requireSession();
  return readAccounts();
}

// A single user's accounts are one entry, and hours is long enough that
// only a save turns it over, which is what the tag is for.
async function readAccounts(): Promise<Account[]> {
  "use cache";
  cacheTag(accountsTag);
  cacheLife("hours");
  return listAccounts(getDb());
}
