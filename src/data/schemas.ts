import * as z from "zod";

import type { Month } from "@/data/schedule";

import { cadences } from "@/data/accounts";
import { bases, measures } from "@/data/milestones";
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
const tie = z.union([z.literal("retirement"), recordId]);

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

// What a condition of a milestone holds: the measure, the basis it is
// held to, and the multiple, nothing or more, so a measure may be held
// to nothing, a liquid net worth above nothing say. An age is held to
// years, since a year is what an age counts, and no sum is, and it is
// whole, since the year it falls in is born plus the age and a fraction
// of a year is no year.
const condition = z
  .object({
    measure: z.enum(measures),
    of: z.enum(bases),
    times: z.number().nonnegative(),
  })
  .refine(
    (held) => (held.measure === "age") === (held.of === "years"),
    "An age is held to years, and nothing else is",
  )
  .refine(
    (held) => held.measure !== "age" || Number.isInteger(held.times),
    "An age is whole years",
  );

// What a milestone holds: the name, and a condition at least, since a
// milestone with none is reached at once. An age is a milestone's only
// condition: one reached at an age falls in a year the plan says, and
// one reached when conditions hold in a year the futures say, and a
// milestone is the one or the other.
export const milestoneValues = {
  conditions: z
    .array(condition)
    .min(1, "A milestone holds a condition")
    .refine(
      (held) =>
        held.length === 1 || held.every(({ measure }) => measure !== "age"),
      "An age is a milestone's only condition",
    ),
  name: named,
};

// What a category of the target allocation holds, as the file gave it:
// the id Portfolio Performance gives its class, never empty, the
// classes above it, its name, never empty, whether it is implemented,
// its share of the whole and what it holds in whole pounds, taken as
// nothing where it was kept before what a category holds was read.
// That the share is a part of the whole, and the categories add up to
// it, is the household's to hold.
export const categoryValues = {
  classes: z.array(z.string()),
  id: z.string().min(1),
  isImplemented: z.boolean(),
  name: named,
  share: z.number(),
  value: pounds.default(0),
};

// A month of a year.
export const month = z.object({
  month: monthOfYear,
  year: z.number().int().positive(),
}) satisfies z.ZodType<Month>;

// The record a save writes over, by its id, or none for a new one,
// which the household gives the next id.
export const target = recordId.nullable();
