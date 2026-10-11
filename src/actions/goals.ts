"use server";

import * as z from "zod";

import type { Goal, GoalValues } from "@/data/goals";
import type { Answer } from "@/lib/answer";

import { goalValues, recordId, target } from "@/data/schemas";
import { removed, written } from "@/lib/records";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// What a save may carry: the name as typed less the space around it,
// which the dialog also trims, and never empty, and the conditions, as
// the model holds them.
const values = z.object(goalValues) satisfies z.ZodType<GoalValues>;

// Deletes the goal with that id. Nothing is tied to a goal, so nothing
// else moves. Checked as a save is.
export async function removeGoal(id: number): Promise<Answer<undefined>> {
  await requireSession();
  const at = recordId.parse(id);
  return amend(({ kept }) => ({
    kept: { ...kept, goals: removed(kept.goals, at, "goal") },
    result: undefined,
  }));
}

// Writes a goal: a new one when the id is null, given the household's
// next id, else over the one with that id, and hands back the goal as
// the household now has it. An action answers a POST from anywhere, so
// it checks the session for itself and parses what it was sent rather
// than trusting the dialog.
export async function saveGoal(
  id: null | number,
  draft: GoalValues,
): Promise<Answer<Goal>> {
  await requireSession();
  const at = target.parse(id);
  const parsed = values.parse(draft);
  return amend(({ kept }) => {
    const {
      next,
      records,
      written: goal,
    } = written(kept.goals, { at, next: kept.next, noun: "goal" }, (id) => ({
      ...parsed,
      id,
    }));
    return { kept: { ...kept, goals: records, next }, result: goal };
  });
}
