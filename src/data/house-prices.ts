import * as z from "zod";

import type { Purchase } from "@/data/accounts";
import type { ProgressPoint } from "@/data/progress";
import type { Month } from "@/data/schedule";

import { Refusal } from "@/lib/answer";
import { formatMonth, isOnOrBefore, monthsBetween } from "@/lib/months";

// The index as the household keeps it once pulled: the month of the
// purchase the points were scaled from, since the points before it are
// the sheet's and the screen says so; the day it was pulled on, an ISO
// date; and the latest month it ran to, from which the points after
// are rolled forward. The figures themselves are not kept, since the
// points carry what they made of them.
export interface HousePrices {
  readonly from: Month;
  readonly pulledOn: string;
  readonly to: Month;
}

// The index as read from the month the house was bought in: that
// month's figure, which what the house cost is scaled from; the months
// published from it; and the latest of them, which the months after it
// are rolled forward from.
export interface Index {
  readonly base: number;
  readonly months: readonly IndexedMonth[];
  readonly to: Month;
}

// What a pull hands back for the screen to say: what was kept, and the
// house's name and what it is worth now, which the pull set its balance
// to.
export interface Pulled extends HousePrices {
  readonly name: string;
  readonly worth: number;
}

// A month of the UK House Price Index: the month, and the average price
// the index is made from that month, whole pounds.
interface IndexedMonth {
  readonly index: number;
  readonly month: Month;
}

// The index as the Land Registry publishes it for the house: the
// region, as the id the Registry gives it names it in an address, the
// figure for the house's type, as the Registry names it among a
// month's figures, and the two as a screen says them. All three stand
// here rather than in the store, as the inflation premium does, since
// the household has one house and nothing else reads them; a second
// house in another county, or of another type, is the day they move
// onto the house. The figure is the average price rather than the
// index, since the index is that price over January 2015's, published
// to a tenth: the ratio of two months' prices is the index's own, and
// to the pound, where the index's tenth moved a house £400 or so at a
// step.
const region = "dorset";
const indexed = "averagePriceDetached";
export const indexedAs = "a detached house in Dorset";

// The Registry's answer, as much of it as is read: the months it lists,
// each with the month it is for, as the Registry writes a month, one of
// the twelve, and the average price for the house's type that month,
// something rather than nothing, since every month is scaled by it.
const answer = z.object({
  result: z.object({
    items: z.array(
      z.object({
        [indexed]: z.number().positive(),
        refMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
      }),
    ),
  }),
});

// Where the Registry answers with the index for the house's region from
// a month on, the months newest first and no more of each than the
// month and the figure for the house's type. Newest first, so a page
// cut short loses the month the house was bought in rather than the
// latest months, and the pull is refused as the index having no such
// month rather than scaled from a page that stops years back.
// ponytail: one page of 200 months reaches back to about 2010; follow
// the answer's next page for a house bought before that.
export function addressOf(from: Month): string {
  return `https://landregistry.data.gov.uk/data/ukhpi/region/${region}.json?min-refMonth=${refMonthOf(from)}&_pageSize=200&_sort=-refMonth&_properties=refMonth,${indexed}`;
}

// The index read out of the Registry's answer from the month the house
// was bought in. An answer that is not the Registry's index is refused,
// and so is one with no figure for that month, as the Registry gives
// for a region it does not know or a month it has not published, since
// nothing scales from a month that is not there. The latest month is
// found rather than taken from the end, so the answer's order is never
// trusted.
export function readIndex(file: Uint8Array, from: Month): Index {
  const parsed = answer.safeParse(jsonOf(file));
  if (!parsed.success) {
    throw new Refusal(
      "The Land Registry's answer is not its house price index",
    );
  }
  const months = parsed.data.result.items.map((item) => ({
    index: item[indexed],
    month: monthOf(item.refMonth),
  }));
  const base = months.find(({ month }) => monthsBetween(month, from) === 0);
  if (base === undefined) {
    throw new Refusal(
      `The Land Registry's index has no ${formatMonth(from)}, the month the house was bought in`,
    );
  }
  return {
    base: base.index,
    months,
    to: months.reduce(
      (latest, each) =>
        monthsBetween(latest.month, each.month) > 0 ? each : latest,
      base,
    ).month,
  };
}

// The points with the house written again off the index: from the
// month it was bought in, each month's house is what it is worth then,
// as below, and the property and vehicles move by what the house moved,
// so the vehicles the sheet summed beside it stay where they were. A
// point before the house was bought is left as it is.
export function revalued(
  points: readonly ProgressPoint[],
  bought: Purchase,
  index: Index,
): ProgressPoint[] {
  return points.map((point) => {
    if (!isOnOrBefore(bought.month, point.month)) {
      return point;
    }
    const house = worthIn(point.month, bought, index);
    return { ...point, assets: point.assets - point.house + house, house };
  });
}

// What the house is worth in a month: what it cost scaled by the
// average price that month over the average price the month it was
// bought, to the pound. A month the Registry has not published yet, as
// the latest two or three are not, takes the latest it has, so the
// house is rolled forward; a month before the purchase takes the
// purchase's, so the house is worth what it cost.
export function worthIn(month: Month, bought: Purchase, index: Index): number {
  const latest = index.months.reduce(
    (held, each) =>
      monthsBetween(held.month, each.month) > 0 &&
      isOnOrBefore(each.month, month)
        ? each
        : held,
    { index: index.base, month: bought.month },
  );
  return Math.round((bought.price * latest.index) / index.base);
}

// What the file holds as JSON, or nothing where it is not JSON, which
// the schema then refuses as it refuses any other shape.
function jsonOf(file: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(file));
  } catch {
    return undefined;
  }
}

// A month as the Registry writes one, "2022-06", read back, January
// being nought as the date gives it.
function monthOf(refMonth: string): Month {
  return {
    month: Number(refMonth.slice(5, 7)) - 1,
    year: Number(refMonth.slice(0, 4)),
  };
}

// A month as the Registry writes one, "2022-06".
function refMonthOf({ month, year }: Month): string {
  return `${String(year)}-${String(month + 1).padStart(2, "0")}`;
}
