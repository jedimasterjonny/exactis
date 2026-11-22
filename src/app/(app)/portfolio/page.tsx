import type { Metadata } from "next";
import type { JSX } from "react";

import { today } from "@/lib/months";
import { portfolio } from "@/lib/nav";
import { getOpened } from "@/store/household";

import { PortfolioScreen } from "./portfolio-screen";

export const metadata: Metadata = { title: portfolio.label };

// The portfolio screen, read behind the session: whether a scenario is
// open, the requested tab from the address (?tab=holdings, ?tab=accounts
// or ?tab=transactions), and the day on the server. The .portfolio file
// itself is opened in the browser and never leaves the device, so the
// page renders behind the loading screen beside it while the session
// and scenario state answer.
export default async function Portfolio({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>): Promise<JSX.Element> {
  const [opened, { tab }] = await Promise.all([getOpened(), searchParams]);
  return (
    <PortfolioScreen
      initialTab={typeof tab === "string" ? tab : undefined}
      isInScenario={opened !== null}
      today={today()}
    />
  );
}
