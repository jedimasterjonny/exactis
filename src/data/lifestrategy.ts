import { strFromU8 } from "fflate";
import * as z from "zod";

import type { Sleeve } from "@/data/cma";
import type { Target } from "@/data/targets";

import { standingFor } from "@/data/class-table";
import { sleeves } from "@/data/cma";
import { Refusal } from "@/lib/answer";
import { sumOf } from "@/lib/ledger";

// What LifeStrategy holds, as Vanguard says: the day it is as of, as an
// ISO date, and its funds, as Vanguard lists them.
export interface Holdings {
  readonly asOf: string;
  readonly funds: readonly Holding[];
}

// A fund LifeStrategy holds, as Vanguard lists it: its name, its SEDOL,
// and its weight of the whole, a fraction.
interface Holding {
  readonly name: string;
  readonly sedol: string;
  readonly weight: number;
}

// A fund placed in the allocation: the category standing for it, and
// the sleeve it is in.
interface Placed {
  readonly category: Target;
  readonly holding: Holding;
  readonly sleeve: Sleeve;
}

// The fund the allocation is retargeted from: Vanguard's LifeStrategy
// 80% Equity, its accumulation shares, by the id Vanguard's site asks
// about a fund under.
export const fund = { name: "LifeStrategy 80% Equity", portId: "9244" };

// Where Vanguard's site asks what a fund holds.
const address = "https://www.vanguardinvestor.co.uk/gpx/graphql";

// What the allocation is retargeted to: the fund's equities scaled to
// nine tenths of the whole, and its bonds to a tenth.
// ponytail: one split for one fund; a field for each when another is
// wanted.
export const split: Record<Sleeve, number> = { bonds: 0.1, stocks: 0.9 };

// The question Vanguard's site asks of what a fund holds, posted as its
// own page posts it: each holding's day, weight, name and SEDOL, the
// fund by its id. LifeStrategy holds eleven funds and a few lines of
// cash, so a hundred is every one of them. A request is sent once, so
// each is made afresh.
export function requestOf(): Request {
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

// What LifeStrategy holds, read out of Vanguard's answer: each fund by
// its SEDOL with its weight of the whole, and the day they are as of. A
// line with no SEDOL is the fund's cash, or a currency it holds, and is
// left out, since the allocation is of funds and the cash is a sliver
// either side of nothing. An answer that is not Vanguard's, or one
// listing no fund, is refused in words saying so, since the screen says
// why nothing was retargeted.
export function readHoldings(sent: Uint8Array): Holdings {
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
  return { asOf: first.effectiveDate, funds };
}

// The share of the whole each category is to hold, by its id, for the
// allocation to hold what LifeStrategy holds at the split: each fund's
// weight of the sleeve it is in, by the sleeve's share of the whole,
// given to the category standing for it, and every other category
// asking for nothing, since it stands for nothing LifeStrategy holds.
// Where more than one category stands for a fund, as one for the index
// a fund tracks and one for the fund it replaced do, the one asking
// for the largest share now takes it, since the others are the ones
// being wound down; two asking alike are refused by name, since
// nothing says which. A fund the table does not hold is refused by
// name, as is one no category stands for, since the allocation cannot
// then hold what the fund does; and a sleeve the fund holds nothing in,
// whether its funds weigh nothing or it lists none, is refused, since
// nothing could be scaled to the sleeve's share and the split would be
// quietly lost.
export function retargeted(
  categories: readonly Target[],
  { funds }: Holdings,
): ReadonlyMap<string, number> {
  const placed: readonly Placed[] = funds.map((holding) => {
    const standing = standingFor(holding.sedol, categories);
    if (standing === undefined) {
      throw new Refusal(
        `${fund.name} holds ${holding.name}, which no category is known to stand for`,
      );
    }
    const [first, second] = standing.categories.toSorted(
      (one, other) => other.share - one.share,
    );
    if (first === undefined) {
      throw new Refusal(
        `No category stands for ${holding.name}, which ${fund.name} holds`,
      );
    }
    if (second?.share === first.share) {
      throw new Refusal(
        `${first.name} and ${second.name} both stand for ${holding.name}, and neither asks for more`,
      );
    }
    return { category: first, holding, sleeve: standing.sleeve };
  });
  const heldIn = (sleeve: Sleeve): number =>
    sumOf(
      placed.filter((each) => each.sleeve === sleeve),
      (each) => each.holding.weight,
    );
  for (const sleeve of sleeves) {
    if (heldIn(sleeve) <= 0) {
      throw new Refusal(`${fund.name} holds nothing in ${sleeve}`);
    }
  }
  const shareOf = ({ holding, sleeve }: Placed): number =>
    (holding.weight / heldIn(sleeve)) * split[sleeve];
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

// What was sent, read as JSON, or a refusal when it is none.
function jsonOf(sent: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(sent)) as unknown;
  } catch {
    throw new Refusal("Vanguard's answer is not JSON");
  }
}
