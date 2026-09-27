"use server";

import * as z from "zod";

import type { Milestone, MilestoneValues } from "@/data/milestones";
import type { Answer } from "@/lib/answer";

import { untied } from "@/data/milestones";
import { milestoneValues, recordId, target } from "@/data/schemas";
import { found, removed, written } from "@/lib/records";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// What a save may carry: the name as typed less the space around it,
// which the row also trims, and never empty, and the year, as the model
// holds them.
const values = z.object(milestoneValues) satisfies z.ZodType<MilestoneValues>;

// Deletes the milestone with that id, and cuts every line's tie to it,
// each end tied to it fixed in the year it falls in now, so the lines
// stay where they were rather than the household refusing a tie to a
// milestone it no longer lists. Checked as a save is. Retirement is no
// record, so no id names it and it cannot be deleted.
export async function removeMilestone(id: number): Promise<Answer<undefined>> {
  await requireSession();
  const at = recordId.parse(id);
  return amend(({ kept }) => {
    const milestone = found(kept.milestones, at, "milestone");
    return {
      kept: {
        ...kept,
        milestones: removed(kept.milestones, at, "milestone"),
        schedule: {
          expenses: kept.schedule.expenses.map((line) =>
            untied(line, milestone),
          ),
          income: kept.schedule.income.map((line) => untied(line, milestone)),
        },
      },
      result: undefined,
    };
  });
}

// Writes a milestone: a new one when the id is null, given the
// household's next id, else over the one with that id, and hands back
// the milestone as the household now has it. An action answers a POST
// from anywhere, so it checks the session for itself and parses what it
// was sent rather than trusting the row. Retirement is written by the
// dashboard's age rather than here, and no id names it.
export async function saveMilestone(
  id: null | number,
  draft: MilestoneValues,
): Promise<Answer<Milestone>> {
  await requireSession();
  const at = target.parse(id);
  const parsed = values.parse(draft);
  return amend(({ kept }) => {
    const {
      next,
      records,
      written: milestone,
    } = written(
      kept.milestones,
      { at, next: kept.next, noun: "milestone" },
      (id) => ({ ...parsed, id }),
    );
    return { kept: { ...kept, milestones: records, next }, result: milestone };
  });
}
