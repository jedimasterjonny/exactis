import type { Month } from "@/data/schedule";

// The forms a month's name is written in: in full, or cut to three
// letters.
type MonthForm = "long" | "short";

// A month's name in full, from Intl, in UTC so the day the year opens
// on cannot slip into the month before it. The year is any, since only
// the month is read.
const names = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  timeZone: "UTC",
});

// A day as the UK writes it in figures, "02/10/2026", in the UK's time.
const ukDay = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "2-digit",
  timeZone: "Europe/London",
  year: "numeric",
});

// The day an ISO date names, its month cut short: "1 Sep 2026". Read in
// UTC, as a month's name is, since an ISO date is read as the start of
// its day there, and put together here rather than by Intl, whose
// en-GB short month is the one a page's server and browser can spell
// apart.
export function formatDay(date: string): string {
  const day = new Date(Date.parse(date));
  return `${String(day.getUTCDate())} ${monthName(day.getUTCMonth(), "short")} ${String(day.getUTCFullYear())}`;
}

// Whether a month falls in or before another: an earlier year, or the
// same year and no later month. A line runs to its last month, a loan's
// payments to the month they clear it in, and a balance is held as of
// a month that has begun, each asked this way.
export function isOnOrBefore(month: Month, other: Month): boolean {
  return monthsBetween(month, other) >= 0;
}

// The month's name, January being nought as the date gives it. The
// short form is the first three letters of the full one rather than
// Intl's own, since that is written from locale data the server and
// the browser each carry and need not agree on: Node spells an en-GB
// September "Sept" where a browser may write "Sep", and a page drawn by
// the one and hydrated by the other then fails on the difference. The
// full names are the same in both.
export function monthName(month: number, form: MonthForm): string {
  const name = names.format(Date.UTC(2000, month));
  return form === "long" ? name : name.slice(0, 3);
}

// The months from one month to another, none for the same month and
// fewer than none for one before it.
export function monthsBetween(from: Month, to: Month): number {
  return (to.year - from.year) * 12 + to.month - from.month;
}

// The month it is, read from the clock, January being nought as the
// date gives it.
export function thisMonth(): Month {
  const now = new Date();
  return { month: now.getMonth(), year: now.getFullYear() };
}

// The day it is, read from the clock, as an ISO date names it. Read in
// the UK's time rather than the clock's own, since the household is in
// the UK and a server keeps UTC, as Vercel's does, which would date
// what is done in the hour after midnight in summer to the day before.
// Intl writes the day, the month and the year in that order for en-GB,
// each in figures, and they are turned about into an ISO date.
export function today(): string {
  return ukDay.format(new Date()).split("/").reverse().join("-");
}
