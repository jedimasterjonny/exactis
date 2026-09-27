import * as z from "zod";

import type { Month } from "@/data/schedule";

import { cadences } from "@/data/accounts";
import { lineGrowths } from "@/data/schedule";

// The pieces the model's rules and the actions' parsing are both built
// from, so a save is parsed as the model holds what it writes, and the
// two cannot drift. A "use server" module may export nothing but its
// actions, so they are kept here rather than beside them.

// A record's id: whole, and from one up.
export const recordId = z.number().int().positive();

// A month of the year, January being nought as the date gives it.
export const monthOfYear = z.number().int().min(0).max(11);

// A name as typed less the space around it, which the forms also trim,
// and never empty.
export const named = z.string().trim().min(1);

// A sum of money: whole pounds, and never below nothing.
export const pounds = z.number().int().nonnegative();

// What a line's end is tied to: retirement, or a milestone by its id.
// That the household lists the milestone is the household's to hold.
export const tie = z.union([z.literal("retirement"), recordId]);

// What every line of both schedules holds: the amount, whole and never
// negative; the years whole, the last one absent for a line that runs
// to the end of the plan; the last month one of the twelve; the name;
// the milestone either end is tied to, or none; and the whole years
// after its milestone the last ends, never before it.
export const lineValues = {
  amount: pounds,
  cadence: z.enum(cadences),
  endsAfter: z.number().int().nonnegative(),
  endsAt: tie.nullable(),
  firstYear: z.number().int().positive(),
  growth: z.enum(lineGrowths),
  lastMonth: monthOfYear.nullable(),
  lastYear: z.number().int().positive().nullable(),
  name: named,
  startsAt: tie.nullable(),
};

// What a milestone holds: the name, and the year, whole and from one up,
// as a line's years are.
export const milestoneValues = {
  name: named,
  year: z.number().int().positive(),
};

// A month of a year.
export const month = z.object({
  month: monthOfYear,
  year: z.number().int().positive(),
}) satisfies z.ZodType<Month>;

// The record a save writes over, by its id, or none for a new one,
// which the household gives the next id.
export const target = recordId.nullable();
