import { strFromU8 } from "fflate";
import * as z from "zod";

import type { Sleeve } from "@/data/cma";
import type { Allocation } from "@/data/rates";
import type { Target } from "@/data/targets";

import { standingFor } from "@/data/class-table";
import { sleeves } from "@/data/cma";
import { Refusal } from "@/lib/answer";
import { sumOf } from "@/lib/ledger";
import { isToCome, monthIn } from "@/lib/months";

// A fund of Vanguard's LifeStrategy range the allocation can be
// retargeted from, its accumulation shares: its name, the id Vanguard's
// site asks about it under, and its own split, which its name gives.
export interface Fund {
  readonly name: string;
  readonly portId: string;
  readonly split: Allocation;
}

// What a LifeStrategy fund holds, as Vanguard says: the fund, the day
// it is as of, as an ISO date, and its funds, as Vanguard lists them.
export interface Holdings {
  readonly asOf: string;
  readonly fund: Fund;
  readonly funds: readonly Holding[];
}

// A fund LifeStrategy holds, as Vanguard lists it: its name, its SEDOL,
// and its weight of the whole, a fraction.
interface Holding {
  readonly name: string;
  readonly sedol: string;
  readonly weight: number;
}

// A fund placed in the allocation: the category standing for it, or for
// a cut of its index, the sleeve the fund is in, and the weight of the
// fund the category takes.
interface Placed {
  readonly category: Target;
  readonly sleeve: Sleeve;
  readonly weight: number;
}

// The funds the allocation can be retargeted from, the first offered
// first, each with its own split.
export const range = [
  { name: "LifeStrategy 80% Equity", portId: "9244", split: { stocks: 0.8 } },
  { name: "LifeStrategy 100% Equity", portId: "9232", split: { stocks: 1 } },
] as const satisfies readonly Fund[];

// Where Vanguard's site asks what a fund holds.
const address = "https://www.vanguardinvestor.co.uk/gpx/graphql";

// The question Vanguard's site asks of what a fund holds, posted as its
// own page posts it: each holding's day, weight, name and SEDOL, the
// fund by its id. A LifeStrategy fund holds a dozen funds at most and a
// few lines of cash, so a hundred is every one of them. A request is
// sent once, so each is made afresh.
export function requestOf(fund: Fund): Request {
  return new Request(address, {
    body: JSON.stringify({
      query:
        "query($portIds: [String!]) { borHoldings(portIds: $portIds) { holdings(limit: 100) { items { effectiveDate marketValuePercentage securityLongDescription sedol1 } } } }",
      variables: { portIds: [fund.portId] },
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

// Vanguard's answer, as far as it is read: the holdings of the one fund
// asked about, each with the day it is as of, its weight in per cent,
// its name and its SEDOL, which a line of cash or of a currency has
// none of.
const answer = z.object({
  data: z.object({
    borHoldings: z.array(
      z.object({
        holdings: z.object({
          items: z.array(
            z.object({
              effectiveDate: z.iso.date(),
              marketValuePercentage: z.number(),
              securityLongDescription: z.string(),
              sedol1: z.string().nullable(),
            }),
          ),
        }),
      }),
    ),
  }),
});

// What the fund given holds, read out of Vanguard's answer: each fund by
// its SEDOL with its weight of the whole, and the day they are as of. A
// line with no SEDOL is the fund's cash, or a currency it holds, and is
// left out, since the allocation is of funds and the cash is a sliver
// either side of nothing. An answer that is not Vanguard's, one listing
// no fund, or one dated after the month it is, is refused in words
// saying so, since the screen says why nothing was retargeted.
export function readHoldings(sent: Uint8Array, fund: Fund): Holdings {
  const parsed = answer.safeParse(jsonOf(sent));
  if (!parsed.success) {
    throw new Refusal(
      `Vanguard answered with something other than what ${fund.name} holds`,
    );
  }
  const items = parsed.data.data.borHoldings.flatMap(
    ({ holdings }) => holdings.items,
  );
  const funds = items.flatMap(
    ({ marketValuePercentage, securityLongDescription, sedol1 }) =>
      sedol1 === null
        ? []
        : [
            {
              name: securityLongDescription,
              sedol: sedol1,
              weight: marketValuePercentage / 100,
            },
          ],
  );
  const [first] = items;
  if (first === undefined || funds.length === 0) {
    throw new Refusal(`Vanguard lists no fund held by ${fund.name}`);
  }
  if (isToCome(monthIn(new Date(first.effectiveDate)))) {
    throw new Refusal(
      `Vanguard dates what ${fund.name} holds to ${first.effectiveDate}, after this month`,
    );
  }
  return { asOf: first.effectiveDate, fund, funds };
}

// The share of the whole each category is to hold, by its id, for the
// allocation to hold what a LifeStrategy fund holds at the split it is
// laid over the categories at, from the plan's split given or none:
// each fund's weight of the sleeve it is in, by the sleeve's share of
// the whole, given to the category standing for it, and every other
// category asking for nothing, since it stands for nothing the fund
// holds. A fund in a sleeve the split gives nothing is passed over,
// since it is given nothing whichever category takes it.
// Where more than one category stands for a fund, as one for the index
// a fund tracks and one for the fund it replaced do, the one asking
// for the largest share now takes it, since the others are the ones
// being wound down; two asking alike are refused by name, since
// nothing says which. Where the one taking a fund stands for the first
// cut of the fund's index, as a category for the S&P 500 does of the
// whole US market, the fund is cut over it and the categories taking
// the other cuts by the cuts' market caps, each cut taken as a fund is,
// by the category standing for it that asks for the largest share,
// even where that is nothing, two asking alike refused, and a cut no
// category stands for going to those that are. A fund the table does not hold is refused by
// name, as is one no category stands for, since the allocation cannot
// then hold what the fund does; and a sleeve the split asks a share of
// that the fund holds nothing in, whether its funds weigh nothing or it
// lists none, is refused, since nothing could be scaled to the sleeve's
// share and the split would be quietly lost.
export function retargeted(
  categories: readonly Target[],
  { fund, funds }: Holdings,
  split: Allocation | null,
): ReadonlyMap<string, number> {
  const { stocks } = splitFor(fund, split);
  const shares: Record<Sleeve, number> = { bonds: 1 - stocks, stocks };
  const placed: readonly Placed[] = funds.flatMap((holding) => {
    const standing = standingFor(holding.sedol, categories);
    if (standing === undefined) {
      throw new Refusal(
        `${fund.name} holds ${holding.name}, which no category is known to stand for`,
      );
    }
    if (shares[standing.sleeve] === 0) {
      return [];
    }
    const first = takerOf(standing.categories, holding.name);
    if (first === undefined) {
      throw new Refusal(
        `No category stands for ${holding.name}, which ${fund.name} holds`,
      );
    }
    const [lead, ...rest] = standing.cuts;
    if (lead?.categories.includes(first) !== true) {
      return [
        { category: first, sleeve: standing.sleeve, weight: holding.weight },
      ];
    }
    const takers = [
      { cap: lead.cap, category: first },
      ...rest.flatMap(({ cap, categories: candidates, name }) => {
        const category = takerOf(candidates, `the ${name} in ${holding.name}`);
        return category === undefined ? [] : [{ cap, category }];
      }),
    ];
    const whole = sumOf(takers, ({ cap }) => cap);
    return takers.map(({ cap, category }) => ({
      category,
      sleeve: standing.sleeve,
      weight: (holding.weight * cap) / whole,
    }));
  });
  const heldIn = (sleeve: Sleeve): number =>
    sumOf(
      placed.filter((each) => each.sleeve === sleeve),
      (each) => each.weight,
    );
  for (const sleeve of sleeves) {
    if (shares[sleeve] > 0 && heldIn(sleeve) <= 0) {
      throw new Refusal(`${fund.name} holds nothing in ${sleeve}`);
    }
  }
  const shareOf = ({ sleeve, weight }: Placed): number =>
    (weight / heldIn(sleeve)) * shares[sleeve];
  return new Map(
    categories.map(({ id }) => [
      id,
      sumOf(
        placed.filter((each) => each.category.id === id),
        shareOf,
      ),
    ]),
  );
}

// The split a fund is laid over the categories at: the plan's split
// given, unless none is, as none is while the plan's split is the
// target allocation's own, or the fund holds no bonds, when it is the
// fund's own, since a fund all in equities has no bonds of its own to
// be scaled to the plan's share.
export function splitFor(fund: Fund, split: Allocation | null): Allocation {
  return split === null || fund.split.stocks === 1 ? fund.split : split;
}

// What was sent, read as JSON, or a refusal when it is none.
function jsonOf(sent: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(sent)) as unknown;
  } catch {
    throw new Refusal("Vanguard's answer is not JSON");
  }
}

// Which of the categories standing for what is named takes it: the one
// asking for the largest share, since the others are being wound down,
// or none where none stands for it; two asking alike are refused by
// name, since nothing says which.
function takerOf(
  standing: readonly Target[],
  named: string,
): Target | undefined {
  const [first, second] = standing.toSorted(
    (one, other) => other.share - one.share,
  );
  if (first !== undefined && second?.share === first.share) {
    throw new Refusal(
      `${first.name} and ${second.name} both stand for ${named}, and neither asks for more`,
    );
  }
  return first;
}
