import type { Metadata } from "next";
import type { JSX } from "react";

import { today } from "@/lib/months";
import { portfolio } from "@/lib/nav";
import { getOpened } from "@/store/household";
import { getPortfolio } from "@/store/portfolio";

import { PortfolioScreen } from "./portfolio-screen";

export const metadata: Metadata = { title: portfolio.label };

// The portfolio screen, read behind the session: whether a scenario is
// open, the household's latest stored .portfolio snapshot parsed on the
// server (so raw binary bytes never cross the RSC boundary), the
// requested tab from the address (?tab=holdings, ?tab=accounts or
// ?tab=transactions), and the day on the server.
export default async function Portfolio({
  searchParams,
}: Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>): Promise<JSX.Element> {
  const [opened, owned, { tab }] = await Promise.all([
    getOpened(),
    getPortfolio(),
    searchParams,
  ]);
  return (
    <PortfolioScreen
      initialTab={typeof tab === "string" ? tab : undefined}
      isInScenario={opened !== null}
      owned={owned}
      today={today()}
    />
  );
}
