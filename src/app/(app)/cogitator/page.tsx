import type { JSX } from "react";

import { blendsOf } from "@/data/cma";
import { getHousehold } from "@/store/household";

import { CogitatorScreen } from "./cogitator-screen";

// The next best trades, over the target allocation last imported and
// what each category of it holds, read from the store behind the
// session. What to trade for is chosen on the screen and the trades
// laid out in the browser as it is, so the screen beside this route
// holds it. The screen is told what the plan holds in bonds now
// beside what the target allocation holds, while the two differ by a
// whole point, as the screens show them; the target allocation's is
// read off the latest vintage's blends, since only a CMA class says
// which sleeve a category is in, so with no CMA, or none it can blend,
// nothing is said. The page renders behind the loading screen beside
// it.
export default async function Cogitator(): Promise<JSX.Element> {
  const { cma, mappings, split, targets } = await getHousehold();
  const blends = cma === null ? null : blendsOf(cma.latest, targets, mappings);
  const targeted =
    blends === null || "short" in blends ? null : blends.bonds.share;
  const now = 1 - split.stocks;
  return (
    <CogitatorScreen
      {...(targeted !== null &&
        Math.round(targeted * 100) !== Math.round(now * 100) && {
          bonds: { now, targeted },
        })}
      targets={targets}
    />
  );
}
