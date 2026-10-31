import type { JSX } from "react";

import * as z from "zod";

import { blendsOf } from "@/data/cma";
import { getHousehold } from "@/store/household";

import { CogitatorScreen } from "./cogitator-screen";

// An amount the month end offers, as its link writes it: whole pounds,
// something, and the month whose close paid it in, as year and month.
const offer = z.object({
  amount: z.coerce.number().int().positive(),
  from: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/u)
    .transform((from) => ({
      month: Number(from.slice(5)) - 1,
      year: Number(from.slice(0, 4)),
    })),
});

// The next best trades, over the target allocation last imported and
// what each category of it holds, read from the store behind the
// session. What to trade for is chosen on the screen and the trades
// laid out in the browser as it is, so the screen beside this route
// holds it. The screen is told what the plan holds in bonds now
// beside what the target allocation holds, while the two differ by a
// whole point, as the screens show them; the target allocation's is
// read off the latest vintage's blends, since only a CMA class says
// which sleeve a category is in, so with no CMA, or none it can blend,
// nothing is said. An amount the month end offers in the address, as
// ?amount=1250&from=2026-08 does, is handed on with the month it came
// from; one the address holds that is not such an amount is left, and
// the amount opens at nothing. The screen holds the amount it opens on
// as its own, so it is drawn afresh whenever the offer changes, as
// leaving the month end's link for the bare address does, which Next
// draws without remounting it; otherwise the offered amount would stay
// while its mark went. The page renders behind the loading screen
// beside it.
export default async function Cogitator({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>): Promise<JSX.Element> {
  const [{ cma, mappings, split, targets }, address] = await Promise.all([
    getHousehold(),
    searchParams,
  ]);
  const blends = cma === null ? null : blendsOf(cma.latest, targets, mappings);
  const targeted =
    blends === null || "short" in blends ? null : blends.bonds.share;
  const now = 1 - split.stocks;
  const offered = offer.safeParse(address);
  return (
    <CogitatorScreen
      key={offered.success ? JSON.stringify(offered.data) : ""}
      {...(targeted !== null &&
        Math.round(targeted * 100) !== Math.round(now * 100) && {
          bonds: { now, targeted },
        })}
      {...(offered.success && {
        offered: { amount: offered.data.amount, month: offered.data.from },
      })}
      targets={targets}
    />
  );
}
