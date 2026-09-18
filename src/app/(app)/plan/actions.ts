"use server";

import { updateTag } from "next/cache";
import * as z from "zod";

import type { ExpenseLine, ExpenseLineValues } from "@/data/expenses";
import type { IncomeLine, IncomeLineValues } from "@/data/income";
import type { LineValues } from "@/data/schedule";

import { cadences, isPension } from "@/data/accounts";
import { expenseKinds } from "@/data/expenses";
import { incomeKinds } from "@/data/income";
import { lineGrowths } from "@/data/schedule";
import { findAccount } from "@/db/accounts";
import { getDb } from "@/db/client";
import { insertExpenseLine, updateExpenseLine } from "@/db/expenses";
import {
  deleteIncomeLine,
  insertIncomeLine,
  updateIncomeLine,
} from "@/db/income";
import { requireSession } from "@/lib/session";

import { expenseLinesTag, incomeLinesTag } from "./store";

// What a save of either line may carry, checked against the model's own
// lists so the two cannot drift: the amount whole and never negative;
// the years whole, the last one absent for a line that runs to the end
// of the plan and never before the first when it is there; the last
// month one of the twelve, and absent when the last year is; and the
// name as typed less the space around it, which the form also trims.
const line = {
  amount: z.number().int().nonnegative(),
  cadence: z.enum(cadences),
  firstYear: z.number().int().positive(),
  growth: z.enum(lineGrowths),
  lastMonth: z.number().int().min(0).max(11).nullable(),
  lastYear: z.number().int().positive().nullable(),
  name: z.string().trim().min(1),
};

const expenseValues = z
  .object({ ...line, kind: z.enum(expenseKinds) })
  .refine(endsAfterItStarts)
  .refine(endsInAYear) satisfies z.ZodType<ExpenseLineValues>;

// An income line adds its kind and its parts, whole and never negative,
// with a bonus or RSUs only on an employment line, and the pension it
// feeds and the share of its base it sacrifices, a fraction of the base
// at most, only on an employment line, with a share given up only where
// there is a pension to take it.
const incomeValues = z
  .object({
    ...line,
    bonus: z.number().int().nonnegative(),
    feeds: z.number().int().positive().nullable(),
    kind: z.enum(incomeKinds),
    rsu: z.number().int().nonnegative(),
    sacrifice: z.number().min(0).max(1),
  })
  .refine(endsAfterItStarts)
  .refine(endsInAYear)
  .refine(
    (values) =>
      values.kind === "employment" ||
      (values.bonus === 0 && values.rsu === 0 && values.feeds === null),
  )
  .refine(
    (values) => values.feeds !== null || values.sacrifice === 0,
  ) satisfies z.ZodType<IncomeLineValues>;

const target = z.number().int().positive().nullable();

// Deletes the income line with that id. Nothing hangs on a line, so it
// goes alone. Checked and expired as a save is.
export async function removeIncomeLine(id: number): Promise<void> {
  await requireSession();
  const at = z.number().int().positive().parse(id);
  await deleteIncomeLine(getDb(), at);
  updateTag(incomeLinesTag);
}

// Writes an expense line, as an income line is written below.
export async function saveExpenseLine(
  id: null | number,
  draft: ExpenseLineValues,
): Promise<ExpenseLine> {
  await requireSession();
  const at = target.parse(id);
  const parsed = expenseValues.parse(draft);
  const db = getDb();
  const saved =
    at === null
      ? await insertExpenseLine(db, parsed)
      : await updateExpenseLine(db, at, parsed);
  updateTag(expenseLinesTag);
  return saved;
}

// Writes an income line: a new one when the id is null, else over the one
// with that id, and hands back the line as the store now has it. An
// action answers a POST from anywhere, so it checks the session for
// itself and parses what it was sent rather than trusting the form; a
// value the form could not have sent fails loudly. A pension the line
// feeds is read before the line is written, since the form offers the
// pensions alone and the store holds the id to an account rather than
// to a pension: one that is no account, or an account of another kind,
// is refused here. The tag is expired before returning, so the same
// round trip carries the list re-read.
export async function saveIncomeLine(
  id: null | number,
  draft: IncomeLineValues,
): Promise<IncomeLine> {
  await requireSession();
  const at = target.parse(id);
  const parsed = incomeValues.parse(draft);
  const db = getDb();
  if (parsed.feeds !== null) {
    const pension = await findAccount(db, parsed.feeds);
    if (pension === null) {
      throw new Error("No account has the id the salary feeds");
    }
    if (!isPension(pension)) {
      throw new Error("A salary feeds a pension alone");
    }
  }
  const saved =
    at === null
      ? await insertIncomeLine(db, parsed)
      : await updateIncomeLine(db, at, parsed);
  updateTag(incomeLinesTag);
  return saved;
}

function endsAfterItStarts(values: LineValues): boolean {
  return values.lastYear === null || values.lastYear >= values.firstYear;
}

// A month to end in needs a year to end in.
function endsInAYear(values: LineValues): boolean {
  return values.lastMonth === null || values.lastYear !== null;
}
