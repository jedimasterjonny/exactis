import type { JSX } from "react";

import { ChanceBoard } from "@/components/app/organisms/chance-board";
import { getHousehold } from "@/store/household";

// The chance of success, over the accounts, the lines, the milestones
// the years are marked by, the plan and the spread its rates carry, read
// from the store behind the session. The
// futures are drawn in the browser as the screen opens, so the board
// owns the header as well as the cards: the header says how far the
// run has come, which only the board knows. The page renders behind
// the loading screen beside it.
export default async function Chance(): Promise<JSX.Element> {
  const { accounts, milestones, plan, schedule, spread } = await getHousehold();
  return (
    <ChanceBoard
      accounts={accounts}
      milestones={milestones}
      plan={plan}
      schedule={schedule}
      spread={spread}
    />
  );
}
