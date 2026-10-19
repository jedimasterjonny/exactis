"use server";

import type { Answer } from "@/lib/answer";

import { soundKept } from "@/data/household";
import { upcast } from "@/data/shapes";
import { refused } from "@/lib/answer";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// Why a file is not read at all: it is no JSON, or JSON that is no
// object, as another app's file may be, which the rules would refuse in
// words about a household it never was.
const unread = "That is not a household file";

// Keeps a household file, as the export hands one out, as the next
// version of the branch open, so every version saved before it stays in
// the store. The file is read in the browser and sent as its text, which
// is parsed here rather than trusted, since an action answers a POST
// from anywhere and a file can be anything: text that is no JSON, or no
// object, is refused as no household file; an object is carried by the
// chain from the shape it was kept in to this one, as a stored version
// is where it comes in, and one a newer app saved is refused; and the
// rest is held to every rule, each refusal in its own words, so an
// object with the wrong fields is refused in the rules' words as any
// save is. It is saved as any edit is, under the check that nothing was
// saved to the branch since it was read, and it replaces the household
// open whole, its bookkeeping as much as its plan.
export async function importHousehold(
  text: string,
): Promise<Answer<undefined>> {
  await requireSession();
  let read: unknown;
  try {
    read = JSON.parse(text);
  } catch {
    return refused(unread);
  }
  if (typeof read !== "object" || read === null || Array.isArray(read)) {
    return refused(unread);
  }
  return amend(() => ({
    kept: soundKept(upcast(read)).kept,
    result: undefined,
  }));
}
