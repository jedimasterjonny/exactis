// A month's name, in full or cut to three letters, from Intl so it is
// spelt as the locale spells it, and in UTC so the day the year opens
// on cannot slip into the month before it. The year is any, since only
// the month is read.
const forms = {
  long: new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }),
  short: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }),
};

// The month's name, January being nought as the date gives it.
export function monthName(month: number, form: keyof typeof forms): string {
  return forms[form].format(Date.UTC(2000, month));
}
