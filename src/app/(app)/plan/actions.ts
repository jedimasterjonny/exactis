"use server";

import { updateTag } from "next/cache";
import * as z from "zod";

import type { IncomeLine, IncomeLineValues } from "@/data/income";

import { cadences } from "@/data/accounts";
import { incomeKinds } from "@/data/income";
import { lineGrowths } from "@/data/schedule";
import { getDb } from "@/db/client";
import { insertIncomeLine, updateIncomeLine } from "@/db/income";
import { requireSession } from "@/lib/session";

import { incomeLinesTag } from "./store";

// What a save may carry, checked against the model's own lists so the
// two cannot drift: the figures whole and never negative, with a bonus
// or RSUs only on an employment line; the years whole, the last one
// absent for a line that runs to the end of the plan and never before
// the first when it is there; and the name as typed less the space
// around it, which the form also trims.
const values = z
  .object({
    amount: z.number().int().nonnegative(),
    bonus: z.number().int().nonnegative(),
    cadence: z.enum(cadences),
    firstYear: z.number().int().positive(),
    growth: z.enum(lineGrowths),
    kind: z.enum(incomeKinds),
    lastYear: z.number().int().positive().nullable(),
    name: z.string().trim().min(1),
    rsu: z.number().int().nonnegative(),
  })
  .refine((line) => line.lastYear === null || line.lastYear >= line.firstYear)
  .refine(
    (line) =>
      line.kind === "employment" || (line.bonus === 0 && line.rsu === 0),
  ) satisfies z.ZodType<IncomeLineValues>;

const target = z.number().int().positive().nullable();

// Writes an income line: a new one when the id is null, else over the one
// with that id, and hands back the line as the store now has it. An
// action answers a POST from anywhere, so it checks the session for
// itself and parses what it was sent rather than trusting the form; a
// value the form could not have sent fails loudly. The tag is expired
// before returning, so the same round trip carries the list re-read.
export async function saveIncomeLine(
  id: null | number,
  draft: IncomeLineValues,
): Promise<IncomeLine> {
  await requireSession();
  const at = target.parse(id);
  const parsed = values.parse(draft);
  const db = getDb();
  const line =
    at === null
      ? await insertIncomeLine(db, parsed)
      : await updateIncomeLine(db, at, parsed);
  updateTag(incomeLinesTag);
  return line;
}
