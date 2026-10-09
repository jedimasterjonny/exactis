import type { JSX } from "react";

import { CogitatorBoard } from "@/components/app/organisms/cogitator-board";
import { getHousehold } from "@/store/household";

// The next best trades, over the target allocation last imported and
// what each category of it holds, read from the store behind the
// session. The amount to invest is typed on the screen and the trades
// laid out in the browser as it is, so the board owns the header as
// well as the cards. The page renders behind the loading screen beside
// it.
export default async function Cogitator(): Promise<JSX.Element> {
  const { targets } = await getHousehold();
  return <CogitatorBoard targets={targets} />;
}
