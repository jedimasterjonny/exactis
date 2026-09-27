"use server";

import * as z from "zod";

import type { ExpenseLine, ExpenseLineValues } from "@/data/expenses";
import type { IncomeLine, IncomeLineDraft } from "@/data/income";
import type { LineValues } from "@/data/schedule";
import type { Answer } from "@/lib/answer";
import type { Held } from "@/store/household";

import { toAccount } from "@/data/accounts";
import { expenseKinds } from "@/data/expenses";
import { incomeKinds, toPension } from "@/data/income";
import { timed } from "@/data/milestones";
import { lineValues, named, pounds, recordId, target } from "@/data/schemas";
import { Refusal } from "@/lib/answer";
import { endsAfterItStarts } from "@/lib/lines";
import { removed, written } from "@/lib/records";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// What a save of an expense line may carry: the values every line
// holds, as the model holds them so the two cannot drift, and its kind.
// That a line with fixed ends ends no earlier than it starts, and in a
// month only of a year it ends in, is the household's to hold, as every
// rule across the fields is; that a line tied to a milestone does, as
// its ends fall on the day, is the save's.
const expenseValues = z.object({
  ...lineValues,
  kind: z.enum(expenseKinds),
}) satisfies z.ZodType<ExpenseLineValues>;

// An income line adds its kind and its parts, whole and never negative,
// the pension it feeds and the share of its base it sacrifices, a
// fraction of the base at most, and the pension it opens, named, holding
// nothing or more and naming its owner, as every pension does. A line
// opens one only while it is a salary, and not while it feeds one by
// id, since the id is the household's to give. What else holds a line,
// the parts and the pension a salary's alone and a share given up only
// into a pension, is the household's to hold, once any pension the line
// opens is among its accounts.
const incomeValues = z
  .object({
    ...lineValues,
    bonus: pounds,
    feeds: recordId.nullable(),
    kind: z.enum(incomeKinds),
    opens: z
      .object({ balance: pounds, name: named, owner: recordId })
      .nullable(),
    rsu: pounds,
    sacrifice: z.number().min(0).max(1),
  })
  .refine((values) => values.kind === "employment" || values.opens === null)
  .refine(
    (values) => values.feeds === null || values.opens === null,
  ) satisfies z.ZodType<IncomeLineDraft>;

// Deletes the income line with that id. Nothing hangs on a line, so it
// goes alone. Checked as a save is.
export async function removeIncomeLine(id: number): Promise<Answer<undefined>> {
  await requireSession();
  const at = recordId.parse(id);
  return amend(({ kept }) => ({
    kept: {
      ...kept,
      schedule: {
        ...kept.schedule,
        income: removed(kept.schedule.income, at, "income line"),
      },
    },
    result: undefined,
  }));
}

// Writes an expense line, as an income line is written below. A line
// written over keeps the loan it pays, since only the house and car
// dialogs link a line to its loan.
export async function saveExpenseLine(
  id: null | number,
  draft: ExpenseLineValues,
): Promise<Answer<ExpenseLine>> {
  await requireSession();
  const at = target.parse(id);
  const parsed = expenseValues.parse(draft);
  return amend((held) => {
    const { kept } = held;
    const {
      next,
      records,
      written: line,
    } = written(
      kept.schedule.expenses,
      { at, next: kept.next, noun: "expense line" },
      (id, listed) =>
        inOrder(
          {
            ...parsed,
            id,
            ...(listed?.pays !== undefined && { pays: listed.pays }),
          },
          held,
        ),
    );
    return {
      kept: {
        ...kept,
        next,
        schedule: { ...kept.schedule, expenses: records },
      },
      result: line,
    };
  });
}

// Writes an income line: a new one when the id is null, else over the one
// with that id, and hands back the line as the household now has it. An
// action answers a POST from anywhere, so it checks the session for
// itself and parses what it was sent rather than trusting the form; a
// value the form could not have sent fails loudly. The pension a line
// feeds by id is held by the household to be one it lists. A pension
// the line opens is added as the account it is, given the household's
// next id, and the line feeds it by that id, so the pension appears
// among the accounts with no more asked of the form, and the two land
// together or not at all.
export async function saveIncomeLine(
  id: null | number,
  draft: IncomeLineDraft,
): Promise<Answer<IncomeLine>> {
  await requireSession();
  const at = target.parse(id);
  const { opens, ...parsed } = incomeValues.parse(draft);
  return amend((held) => {
    const { kept } = held;
    const pension =
      opens === null ? null : toAccount(toPension(opens), kept.next);
    const {
      next,
      records,
      written: line,
    } = written(
      kept.schedule.income,
      {
        at,
        next: pension === null ? kept.next : kept.next + 1,
        noun: "income line",
      },
      (id) =>
        inOrder({ ...parsed, feeds: pension?.id ?? parsed.feeds, id }, held),
    );
    return {
      kept: {
        ...kept,
        accounts:
          pension === null ? kept.accounts : [...kept.accounts, pension],
        next,
        schedule: { ...kept.schedule, income: records },
      },
      result: line,
    };
  });
}

// The line as written, once it is held to ending no earlier than it
// starts as its ends fall on the day it is saved, each end tied to a
// milestone read off it. The household holds a line with both ends
// fixed to the same, and leaves a tied one to run no years when its
// milestone is later moved past its other end, since the retirement age
// is moved on the dashboard; a line saved that way would be one made
// wrong on purpose, so the save refuses it in the household's words.
function inOrder<TLine extends LineValues>(
  line: TLine,
  { household, kept }: Held,
): TLine {
  if (!endsAfterItStarts(timed(line, kept.milestones, household.plan))) {
    throw new Refusal("A line ends no earlier than it starts");
  }
  return line;
}
