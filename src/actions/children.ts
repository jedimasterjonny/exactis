"use server";

import * as z from "zod";

import type { Child, ChildValues } from "@/data/children";
import type { Answer } from "@/lib/answer";

import { child as heldChild } from "@/data/household";
import { childValues, recordId, target } from "@/data/schemas";
import { found, holdUnchanged, removed, written } from "@/lib/records";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// What a save may carry: the name as typed less the space around it,
// which the dialog also trims, and never empty, and the month born, as
// the model holds it.
const values = z.object(childValues) satisfies z.ZodType<ChildValues>;

// A child as the dialog opened on them, or none for a new one, parsed as
// the household parses its children, so the child opened and the one
// held now compare key for key.
const opening = heldChild.nullable();

// Deletes the child with that id. Checked as a save is.
export async function removeChild(id: number): Promise<Answer<undefined>> {
  await requireSession();
  const at = recordId.parse(id);
  return amend(({ kept }) => ({
    kept: { ...kept, children: removed(kept.children ?? [], at, "child") },
    result: undefined,
  }));
}

// Writes a child: a new one when the id is null, given the household's
// next id, else over the one with that id, and hands back the child as
// the household now has them. An action answers a POST from anywhere, so
// it checks the session for itself and parses what it was sent rather
// than trusting the dialog. The dialog sends the child as it opened on
// them beside the draft, and an edit of one changed since, as on another
// device meanwhile, is refused rather than written back over the change.
export async function saveChild(
  id: null | number,
  draft: ChildValues,
  opened: Child | null,
): Promise<Answer<Child>> {
  await requireSession();
  const at = target.parse(id);
  const parsed = values.parse(draft);
  const asOpened = opening.parse(opened);
  return amend(({ household, kept }) => {
    if (at !== null) {
      holdUnchanged(asOpened, found(household.children, at, "child"), "child");
    }
    const {
      next,
      records,
      written: child,
    } = written(
      kept.children ?? [],
      { at, next: kept.next, noun: "child" },
      (id) => ({ ...parsed, id }),
    );
    return { kept: { ...kept, children: records, next }, result: child };
  });
}
