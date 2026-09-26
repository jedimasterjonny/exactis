import type { Month } from "@/data/schedule";

// A month's name, in full or cut to three letters, from Intl so it is
// spelt as the locale spells it, and in UTC so the day the year opens
// on cannot slip into the month before it. The year is any, since only
// the month is read.
const forms = {
  long: new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }),
  short: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }),
};

// Whether a month falls in or before another: an earlier year, or the
// same year and no later month. A line runs to its last month, a loan's
// payments to the month they clear it in, and a balance is held as of
// a month that has begun, each asked this way.
export function isOnOrBefore(month: Month, other: Month): boolean {
  return monthsBetween(month, other) >= 0;
}

// The month's name, January being nought as the date gives it.
export function monthName(month: number, form: keyof typeof forms): string {
  return forms[form].format(Date.UTC(2000, month));
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
