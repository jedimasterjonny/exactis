import type { JSX } from "react";

import { getHousehold } from "@/store/household";

import { ChanceScreen } from "./chance-screen";

// The chance of success, over the accounts, the lines, the milestones
// the years are marked by and the run is read against, the plan and
// the spread its rates carry, read from the store behind the session.
// The
// futures are drawn in the browser as the screen opens, so the screen
// owns the header as well as the cards: the header says how far the
// run has come, which only the screen knows. The page renders behind
// the loading screen beside it.
export default async function Chance(): Promise<JSX.Element> {
  const { accounts, milestones, plan, schedule, spread } = await getHousehold();
  return (
    <ChanceScreen
      accounts={accounts}
      milestones={milestones}
      plan={plan}
      schedule={schedule}
      spread={spread}
    />
  );
}
