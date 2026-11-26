import type { Metadata } from "next";
import type { JSX } from "react";

import { maxPortfolioMoney } from "@/data/portfolio";
import { today } from "@/lib/months";
import { portfolio } from "@/lib/nav";
import { getOpened } from "@/store/household";
import { getPortfolio } from "@/store/portfolio";

import type { PortfolioTradeHandoff } from "./portfolio-screen";

import { PortfolioScreen } from "./portfolio-screen";

export const metadata: Metadata = { title: portfolio.label };

type QueryValue = string | string[] | undefined;

type SearchParams = Record<string, QueryValue>;

const tradeAmountPattern = /^\d+(?:\.\d{1,2})?$/u;

// The portfolio screen, read behind the session: whether a scenario is
// open, the household's latest stored .portfolio snapshot parsed on the
// server (so raw binary bytes never cross the RSC boundary), the
// requested tab (?tab=holdings, ?tab=accounts or ?tab=transactions) or
// trade handoff (?trade=purchase|sale with optional amount, portfolio,
// security or category), and the day on the server.
export default async function Portfolio({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>): Promise<JSX.Element> {
  const [opened, owned, params] = await Promise.all([
    getOpened(),
    getPortfolio(),
    searchParams,
  ]);
  const initialTrade = parseTradeHandoff(params);
  return (
    <PortfolioScreen
      initialTab={singleParam(params["tab"])}
      {...(initialTrade !== undefined && { initialTrade })}
      isInScenario={opened !== null}
      owned={owned}
      today={today()}
    />
  );
}

function optionalIdParam(value: QueryValue): string | undefined {
  const raw = singleParam(value);
  return raw !== undefined && raw.length > 0 && raw.length <= 200
    ? raw
    : undefined;
}

function parseTradeAmount(value: QueryValue): number | undefined {
  const raw = singleParam(value);
  if (raw === undefined || !tradeAmountPattern.test(raw)) {
    return undefined;
  }
  const parsed = Number(raw);
  return parsed <= maxPortfolioMoney && Math.round(parsed * 100) >= 1
    ? parsed
    : undefined;
}

function parseTradeHandoff(
  params: SearchParams,
): PortfolioTradeHandoff | undefined {
  const type = singleParam(params["trade"]);
  if (type !== "purchase" && type !== "sale") {
    return undefined;
  }
  const amount = parseTradeAmount(params["amount"]);
  const categoryId = optionalIdParam(params["category"]);
  const portfolioId = optionalIdParam(params["portfolio"]);
  const securityId = optionalIdParam(params["security"]);
  return {
    ...(amount !== undefined && { amount }),
    ...(categoryId !== undefined && { categoryId }),
    ...(portfolioId !== undefined && { portfolioId }),
    ...(securityId !== undefined && { securityId }),
    type,
  };
}

function singleParam(value: QueryValue): string | undefined {
  return typeof value === "string" ? value : undefined;
}
