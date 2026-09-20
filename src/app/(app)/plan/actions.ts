"use server";

import { updateTag } from "next/cache";
import * as z from "zod";

import type { ExpenseLine, ExpenseLineValues } from "@/data/expenses";
import type { IncomeLine, IncomeLineDraft, Opening } from "@/data/income";
import type { LineValues } from "@/data/schedule";
import type { Database } from "@/db/accounts";

import { cadences, isPension } from "@/data/accounts";
import { expenseKinds } from "@/data/expenses";
import { incomeKinds, toPension } from "@/data/income";
import { lineGrowths } from "@/data/schedule";
import { findAccount, insertAccount } from "@/db/accounts";
import { getDb } from "@/db/client";
import { insertExpenseLine, updateExpenseLine } from "@/db/expenses";
import {
  deleteIncomeLine,
  insertIncomeLine,
  updateIncomeLine,
} from "@/db/income";
import { requireSession } from "@/lib/session";

import { accountsTag } from "../accounts/store";
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
// there is a pension to take it, listed or opened. A pension the line
// opens is named, as an account is, and holds nothing or more; a line
// opens one only while it is a salary, and not while it feeds one by
// id, since the id is the store's to give.
const incomeValues = z
  .object({
    ...line,
    bonus: z.number().int().nonnegative(),
    feeds: z.number().int().positive().nullable(),
    kind: z.enum(incomeKinds),
    opens: z
      .object({
        balance: z.number().int().nonnegative(),
        name: z.string().trim().min(1),
      })
      .nullable(),
    rsu: z.number().int().nonnegative(),
    sacrifice: z.number().min(0).max(1),
  })
  .refine(endsAfterItStarts)
  .refine(endsInAYear)
  .refine(
    (values) =>
      values.kind === "employment" ||
      (values.bonus === 0 &&
        values.rsu === 0 &&
        values.feeds === null &&
        values.opens === null),
  )
  .refine((values) => values.feeds === null || values.opens === null)
  .refine(
    (values) =>
      values.feeds !== null || values.opens !== null || values.sacrifice === 0,
  ) satisfies z.ZodType<IncomeLineDraft>;

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
// is refused here. A pension the line opens is written first, as the
// account it is, and the line feeds it by the id the store gave, so
// the pension appears among the accounts with no more asked of the
// form; the two are written one after the other rather than in a
// transaction, since Neon's HTTP driver runs none, and a failure
// between them leaves the pension opened and the line unwritten, which
// reaches the form as an error. The tags are expired before returning,
// so the same round trip carries the lists re-read, the accounts' only
// when a pension was opened.
export async function saveIncomeLine(
  id: null | number,
  draft: IncomeLineDraft,
): Promise<IncomeLine> {
  await requireSession();
  const at = target.parse(id);
  const { opens, ...parsed } = incomeValues.parse(draft);
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
  const values =
    opens === null
      ? parsed
      : { ...parsed, feeds: await openPension(db, opens) };
  const saved =
    at === null
      ? await insertIncomeLine(db, values)
      : await updateIncomeLine(db, at, values);
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

// A pension opened with a line: written as the account it is, and the
// id the store gave it, for the line to feed. The accounts are expired
// here, where one is added, so the tag goes with the write it answers
// for rather than with the line's.
async function openPension(db: Database, opening: Opening): Promise<number> {
  const { id } = await insertAccount(db, toPension(opening));
  updateTag(accountsTag);
  return id;
}
