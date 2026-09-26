"use server";

import * as z from "zod";

import type { ExpenseLine, ExpenseLineValues } from "@/data/expenses";
import type { IncomeLine, IncomeLineDraft } from "@/data/income";
import type { Answer } from "@/lib/answer";

import { toAccount } from "@/data/accounts";
import { expenseKinds } from "@/data/expenses";
import { incomeKinds, toPension } from "@/data/income";
import { lineValues, named, pounds, recordId, target } from "@/data/schemas";
import { found, replaced } from "@/lib/records";
import { requireSession } from "@/lib/session";
import { amend } from "@/store/household";

// What a save of an expense line may carry: the values every line
// holds, as the model holds them so the two cannot drift, and its kind.
// That a line ends no earlier than it starts, and in a month only of a
// year it ends in, is the household's to hold, as every rule across the
// fields is.
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
  return amend(({ kept }) => {
    found(kept.schedule.income, at, "income line");
    return {
      kept: {
        ...kept,
        schedule: {
          ...kept.schedule,
          income: kept.schedule.income.filter(({ id }) => id !== at),
        },
      },
      result: undefined,
    };
  });
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
  return amend(({ kept }) => {
    const { expenses } = kept.schedule;
    if (at === null) {
      const written = { ...parsed, id: kept.next };
      return {
        kept: {
          ...kept,
          next: kept.next + 1,
          schedule: { ...kept.schedule, expenses: [...expenses, written] },
        },
        result: written,
      };
    }
    const { pays } = found(expenses, at, "expense line");
    const written = { ...parsed, id: at, ...(pays !== undefined && { pays }) };
    return {
      kept: {
        ...kept,
        schedule: { ...kept.schedule, expenses: replaced(expenses, written) },
      },
      result: written,
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
  return amend(({ kept }) => {
    const pension =
      opens === null ? null : toAccount(toPension(opens), kept.next);
    const next = pension === null ? kept.next : kept.next + 1;
    const values = { ...parsed, feeds: pension?.id ?? parsed.feeds };
    const { income } = kept.schedule;
    if (at !== null) {
      found(income, at, "income line");
    }
    const written = { ...values, id: at ?? next };
    return {
      kept: {
        ...kept,
        accounts:
          pension === null ? kept.accounts : [...kept.accounts, pension],
        next: at === null ? next + 1 : next,
        schedule: {
          ...kept.schedule,
          income:
            at === null ? [...income, written] : replaced(income, written),
        },
      },
      result: written,
    };
  });
}
