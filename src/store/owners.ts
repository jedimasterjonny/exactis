import "server-only";
import { cacheLife, cacheTag } from "next/cache";

import type { Owner } from "@/data/owners";

import { getDb } from "@/db/client";
import { listOwners } from "@/db/owners";
import { requireSession } from "@/lib/session";

// The tag every read of the owners carries and every write expires, so a
// save is seen on the way back from it rather than when the cache next
// turns over.
export const ownersTag = "owners";

// The owners, for whoever is signed in, read as the accounts are: the
// session read out here, and the read behind it cached and tagged.
export async function getOwners(): Promise<Owner[]> {
  await requireSession();
  return readOwners();
}

// A single user's owners are one entry, and hours is long enough that
// only a save turns it over, which is what the tag is for.
async function readOwners(): Promise<Owner[]> {
  "use cache";
  cacheTag(ownersTag);
  cacheLife("hours");
  return listOwners(getDb());
}
