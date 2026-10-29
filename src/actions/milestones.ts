"use server";

import * as z from "zod";

import type { Condition, Milestone, MilestoneValues } from "@/data/milestones";
import type { Answer } from "@/lib/answer";

import { milestone as heldMilestone } from "@/data/household";
import { untied } from "@/data/milestones";
import {
  milestoneValues,
  recordId,
  retirementConditions,
  target,
} from "@/data/schemas";
import { Refusal } from "@/lib/answer";
import { found, holdUnchanged, removed, written } from "@/lib/records";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// What a save may carry: the name as typed less the space around it,
// which the dialog also trims, and never empty, and the conditions, as
// the model holds them.
const values = z.object(milestoneValues) satisfies z.ZodType<MilestoneValues>;

// A milestone as its dialog opened on it, or none for a new one, parsed
// as the household parses its milestones, so the milestone opened and
// the one held now compare key for key.
const opening = heldMilestone.nullable();

// Deletes the milestone with that id, and cuts every line's tie to it,
// each end tied to it fixed in the year it falls in now, so the lines
// stay where they were rather than the household refusing a tie to a
// milestone it no longer lists; nothing is tied to one reached when
// conditions hold, so nothing else moves with it. A milestone a house
// moves at stays, since a move has no year of its own to be fixed in,
// and is refused in words that say so rather than the household's.
// Checked as a save is. Retirement is no record, so no id names it and
// it cannot be deleted.
export async function removeMilestone(id: number): Promise<Answer<undefined>> {
  await requireSession();
  const at = recordId.parse(id);
  return amend(({ household, kept }) => {
    const milestone = found(kept.milestones, at, "milestone");
    if (kept.accounts.some(({ move }) => move?.at === at)) {
      throw new Refusal("A milestone a house moves at stays");
    }
    return {
      kept: {
        ...kept,
        milestones: removed(kept.milestones, at, "milestone"),
        schedule: {
          expenses: kept.schedule.expenses.map((line) =>
            untied(line, milestone, household.plan),
          ),
          income: kept.schedule.income.map((line) =>
            untied(line, milestone, household.plan),
          ),
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
// was sent rather than trusting the dialog. The dialog sends the
// milestone as it opened on it beside the draft, and an edit of one
// changed since, as on another device meanwhile, is refused rather than
// written back over the change. Retirement is no record and no id names
// it; it is written by saveRetirement.
export async function saveMilestone(
  id: null | number,
  draft: MilestoneValues,
  opened: Milestone | null,
): Promise<Answer<Milestone>> {
  await requireSession();
  const at = target.parse(id);
  const parsed = values.parse(draft);
  const asOpened = opening.parse(opened);
  return amend(({ household, kept }) => {
    if (at !== null) {
      holdUnchanged(
        asOpened,
        found(household.milestones, at, "milestone"),
        "milestone",
      );
    }
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

// Writes what the plan's owner retires on, the first listed owner,
// whose plan it is, and hands it back as the plan lays it out among the
// milestones: named Retirement, reached on what was sent. An action
// answers a POST from anywhere, so it checks the session for itself and
// parses what it was sent, as the household parses a retirement,
// rather than trusting the dialog. The household holds a retirement at
// an age to the plan's end, and the age one on conditions comes by to
// before it, in its words.
export async function saveRetirement(
  conditions: readonly Condition[],
): Promise<Answer<MilestoneValues>> {
  await requireSession();
  const parsed = retirementConditions.parse(conditions);
  return amend(({ kept }) => ({
    kept: {
      ...kept,
      owners: kept.owners.map((owner, index) =>
        index === 0 ? { ...owner, retirement: parsed } : owner,
      ),
    },
    result: { conditions: parsed, name: "Retirement" },
  }));
}
